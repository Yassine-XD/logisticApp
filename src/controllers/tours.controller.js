// src/controllers/tours.controller.js
const Tour = require("../models/Tour");
const Demand = require("../models/Demand");
const Settings = require("../models/Settings");
const { log } = require("../utils/logger");

function dayRange(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function tireWeights() {
  const s = await Settings.getSettings().catch(() => null);
  return {
    small: s?.smallTireKg ?? 8.58,
    medium: s?.mediumTireKg ?? 59,
  };
}

function isDriverOf(req, tour) {
  return String(tour.driver?._id || tour.driver) === String(req.user.driverId);
}

function ensureCanAccessTour(req, tour) {
  if (req.user.role === "driver" && !isDriverOf(req, tour)) {
    const e = new Error("No autorizado para esta ruta");
    e.status = 403;
    throw e;
  }
}

/** GET /tours/active?date= — board of active tours for a date (dispatcher/admin) */
async function getActiveTours(req, res, next) {
  try {
    const { start, end } = dayRange(req.query.date);
    const tours = await Tour.find({
      date: { $gte: start, $lte: end }, // ← date filter now actually applied
      status: { $in: ["PLANNED", "IN_PROGRESS"] },
    })
      .populate({ path: "driver", populate: { path: "vehicle" } })
      .sort({ createdAt: 1 })
      .lean();

    const shaped = tours.map((tour) => {
      const completed = tour.stops.filter((s) =>
        ["COMPLETED", "PARTIAL"].includes(s.status)
      ).length;
      return {
        id: String(tour._id),
        driver: tour.driver?.name || "—",
        driverId: tour.driver?._id ? String(tour.driver._id) : null,
        vehicle: tour.driver?.vehicle?.plate || tour.vehicle || "—",
        status: tour.status,
        tourIndex: tour.tourIndex,
        completedStops: completed,
        totalStops: tour.stops.length,
        capacityKg: tour.capacityKg,
        totalPlannedKg: tour.totalPlannedKg,
        totalActualKg: tour.totalActualKg,
        totalDistanceKm: tour.totalDistanceKm,
        stops: tour.stops.map((s) => ({
          id: String(s._id),
          name: s.garageName || "—",
          address: s.address
            ? `${s.address.street || ""}, ${s.address.city || ""}`.replace(/^, |, $/g, "")
            : "—",
          phone: s.contact?.phone || null,
          kg: s.plannedKg || 0,
          actualKg: s.actualKg,
          status: s.status,
          geo: s.geo,
          deadlineAt: s.deadlineAt,
          completedAt: s.completedAt,
          notes: s.notes,
        })),
      };
    });

    res.json({ date: start.toISOString().slice(0, 10), total: shaped.length, tours: shaped });
  } catch (err) {
    next(err);
  }
}

/** GET /tours/mine?date= — the authenticated driver's tours for a date */
async function getMyTours(req, res, next) {
  try {
    if (!req.user.driverId) {
      return res.status(400).json({ error: "El usuario no está vinculado a un conductor" });
    }
    const { start, end } = dayRange(req.query.date);
    const tours = await Tour.find({
      driver: req.user.driverId,
      date: { $gte: start, $lte: end },
    })
      .sort({ tourIndex: 1, createdAt: 1 })
      .lean();
    res.json({ tours, count: tours.length });
  } catch (err) {
    next(err);
  }
}

/** GET /tours/:tourId */
async function getTour(req, res, next) {
  try {
    const tour = await Tour.findById(req.params.tourId)
      .populate("driver")
      .lean();
    if (!tour) return res.status(404).json({ error: "Ruta no encontrada" });
    ensureCanAccessTour(req, tour);
    res.json({ tour });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/** GET /drivers/:driverId/tours */
async function getDriverTours(req, res, next) {
  try {
    if (req.user.role === "driver" && String(req.user.driverId) !== req.params.driverId) {
      return res.status(403).json({ error: "No autorizado" });
    }
    const filter = { driver: req.params.driverId };
    if (req.query.date) {
      const { start, end } = dayRange(req.query.date);
      filter.date = { $gte: start, $lte: end };
    }
    if (req.query.status) filter.status = req.query.status;
    const tours = await Tour.find(filter).sort({ date: -1, tourIndex: 1 }).lean();
    res.json({ tours, count: tours.length });
  } catch (err) {
    next(err);
  }
}

/** POST /tours/:tourId/start */
async function startTour(req, res, next) {
  try {
    const tour = await Tour.findById(req.params.tourId);
    if (!tour) return res.status(404).json({ error: "Ruta no encontrada" });
    ensureCanAccessTour(req, tour);
    if (tour.status !== "PLANNED") {
      return res.status(400).json({ error: `No se puede iniciar una ruta en estado ${tour.status}` });
    }
    tour.status = "IN_PROGRESS";
    tour.stops.forEach((s) => {
      if (s.status === "SCHEDULED") s.status = "SCHEDULED";
    });
    await tour.save();
    // Flag its demands as in progress
    await Demand.updateMany(
      { "assigned.tourId": tour._id },
      { $set: { status: "IN_PROGRESS" } }
    );
    res.json({ success: true, tour });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

async function recordCollection(req, res, next, statusValue) {
  const { tourId, stopId } = req.params;
  const { smallTires, mediumTires, notes } = req.body;
  if (smallTires == null || mediumTires == null) {
    return res.status(400).json({ error: "smallTires y mediumTires son obligatorios" });
  }
  if (smallTires < 0 || mediumTires < 0) {
    return res.status(400).json({ error: "Los conteos no pueden ser negativos" });
  }
  const tour = await Tour.findById(tourId);
  if (!tour) return res.status(404).json({ error: "Ruta no encontrada" });
  ensureCanAccessTour(req, tour);
  const stop = tour.stops.id(stopId);
  if (!stop) return res.status(404).json({ error: "Parada no encontrada" });

  const { small, medium } = await tireWeights();
  const actualKg = Math.round(smallTires * small + mediumTires * medium);

  stop.status = statusValue;
  stop.actualKg = actualKg;
  stop.smallTires = smallTires;
  stop.mediumTires = mediumTires;
  stop.completedAt = new Date();
  if (notes) stop.notes = notes;

  await Demand.findByIdAndUpdate(stop.demand, { $set: { status: statusValue, collectedAt: new Date() } });

  const allDone = tour.stops.every((s) =>
    ["COMPLETED", "NOT_READY", "PARTIAL"].includes(s.status)
  );
  if (tour.status === "PLANNED") tour.status = "IN_PROGRESS";
  if (allDone) tour.status = "COMPLETED";
  await tour.save();

  log(`[tour] ${tourId} stop ${stopId} → ${statusValue} (${actualKg}kg)`);
  return res.json({
    success: true,
    tour,
    stopSummary: { plannedKg: stop.plannedKg, actualKg, smallTires, mediumTires },
  });
}

/** POST /tours/:tourId/stops/:stopId/complete */
async function completeStop(req, res, next) {
  try {
    await recordCollection(req, res, next, "COMPLETED");
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/** POST /tours/:tourId/stops/:stopId/partial */
async function partialStop(req, res, next) {
  try {
    await recordCollection(req, res, next, "PARTIAL");
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/** POST /tours/:tourId/stops/:stopId/not-ready — release the demand */
async function notReadyStop(req, res, next) {
  try {
    const { tourId, stopId } = req.params;
    const { reason } = req.body;
    const tour = await Tour.findById(tourId);
    if (!tour) return res.status(404).json({ error: "Ruta no encontrada" });
    ensureCanAccessTour(req, tour);
    const stop = tour.stops.id(stopId);
    if (!stop) return res.status(404).json({ error: "Parada no encontrada" });

    stop.status = "NOT_READY";
    stop.completedAt = new Date();
    if (reason) stop.notes = reason;

    // Release the demand so it can be re-planned
    await Demand.findByIdAndUpdate(stop.demand, {
      $set: { status: "NOT_READY" },
      $unset: { assigned: "" },
    });

    const allDone = tour.stops.every((s) =>
      ["COMPLETED", "NOT_READY", "PARTIAL"].includes(s.status)
    );
    if (tour.status === "PLANNED") tour.status = "IN_PROGRESS";
    if (allDone) tour.status = "COMPLETED";
    await tour.save();

    res.json({ success: true, tour, message: "Parada marcada como no lista; demanda liberada." });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

module.exports = {
  getActiveTours,
  getMyTours,
  getTour,
  getDriverTours,
  startTour,
  completeStop,
  partialStop,
  notReadyStop,
};
