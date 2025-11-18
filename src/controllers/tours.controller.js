// src/controllers/tours.controller.js
const Driver = require("../models/Driver");
const Tour = require("../models/Tour");
const Demand = require("../models/Demand");
const { log } = require("../utils/logger");

const DEFAULT_TRUCK_CAPACITY_KG = 3200;

// --- helpers ---

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return R * c;
}

/**
 * Very simple greedy: from driver's current position,
 * always pick the closest high-priority demand that fits remaining capacity.
 */
function buildGreedyTourForDriver({ driver, demands, start, maxStops }) {
  let remainingCapacity =
    driver.vehicle?.capacityKg ||
    driver.capacityKg ||
    DEFAULT_TRUCK_CAPACITY_KG;

  let currentPos = start;
  let totalDistanceKm = 0;
  const selected = [];
  const pool = demands.map((d) => ({ ...d, used: false }));

  while (selected.length < maxStops) {
    let best = null;
    let bestIdx = -1;
    let bestScore = Infinity;

    pool.forEach((d, idx) => {
      if (d.used) return;
      if (d.qtyEstimatedKg > remainingCapacity) return;
      if (!d.geo?.lat || !d.geo?.lng) return;

      const dist = distanceKm(currentPos, d.geo);
      const priority = d.priority || 0;
      const priorityFactor = 1 + priority / 50; // 1..3
      const score = dist / priorityFactor;

      if (score < bestScore) {
        bestScore = score;
        best = d;
        bestIdx = idx;
      }
    });

    if (!best) break;

    best.used = true;
    remainingCapacity -= best.qtyEstimatedKg;

    const legDistance = distanceKm(currentPos, best.geo);
    totalDistanceKm += legDistance;
    currentPos = best.geo;

    selected.push({
      demand: best,
      distanceFromPrevKm: Number(legDistance.toFixed(2)),
    });
  }

  return {
    remainingCapacityKg: remainingCapacity,
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    selected,
  };
}

// --- controllers ---

/**
 * POST /drivers/me/tours/request
 * Body: { lat, lng, date? }
 *
 * Meaning:
 *  - "I am a driver, here's my current location, give me my next tour for today."
 */
async function requestTour(req, res, next) {
  try {
    // from auth middleware (preferred)
    const driverIdFromToken = req.body.driverId || req.driverId?.id;
    const { lat, lng, date } = req.body;

    if (!driverIdFromToken) {
      return res.status(401).json({ error: "Driver auth required" });
    }
    if (!lat || !lng) {
      return res
        .status(400)
        .json({ error: "Driver current location {lat,lng} is required" });
    }

    const driver = await Driver.findById(driverIdFromToken).populate("vehicle");
    console.log(driver);
    if (!driver || !driver.active) {
      return res.status(404).json({ error: "Driver not found or inactive" });
    }

    const today = date ? new Date(date) : new Date();
    const dayStart = new Date(today);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(today);
    dayEnd.setHours(23, 59, 59, 999);

    // 1) Check if driver already has an open tour today
    const existingTour = await Tour.findOne({
      driver: driver._id,
      date: { $gte: dayStart, $lte: dayEnd },
      status: { $in: ["PLANNED", "IN_PROGRESS"] },
    }).populate("stops.demand");

    if (existingTour) {
      return res.json({
        reused: true,
        tour: existingTour,
      });
    }

    // 2) Check daily tours count
    const toursTodayCount = await Tour.countDocuments({
      driver: driver._id,
      date: { $gte: dayStart, $lte: dayEnd },
    });

    if (toursTodayCount >= (driver.maxDailyTours || 3)) {
      return res.status(200).json({
        reused: false,
        info: "Max daily tours reached for this driver",
        tour: null,
      });
    }

    // 3) Fetch eligible demands for this driver
    //    For now: all NEW/CONFIRMED & not assigned.
    const demands = await Demand.find({
      status: { $in: ["NEW", "CONFIRMED"] },
      "assigned.driverId": { $exists: false },
      deadlineAt: { $gte: dayStart }, // not already expired
    }).sort({ priority: -1, deadlineAt: 1 }); // most urgent first

    console.log("demands" + demands);
    
    if (!demands.length) {
      return res.status(200).json({
        reused: false,
        info: "No eligible demands to build a tour",
        tour: null,
      });
    }

    const startPos = { lat: Number(lat), lng: Number(lng) };

    const { remainingCapacityKg, totalDistanceKm, selected } =
      buildGreedyTourForDriver({
        driver,
        demands,
        start: startPos,
        maxStops: driver.maxStopsPerTour || 8,
      });

    if (!selected.length) {
      return res.status(200).json({
        reused: false,
        info: "No demands fit capacity from current position",
        tour: null,
      });
    }

    // 4) Build Tour document
    const stopDocs = selected.map((sel, idx) => {
      const d = sel.demand;
      return {
        demand: d._id,
        order: idx + 1,
        status: "SCHEDULED",
        plannedKg: d.qtyEstimatedKg,
        garageName: d.garageName,
        garageId: d.garageId,
        geo: d.geo,
        address: d.address,
        contact: d.contact,
        distanceFromPrevKm: sel.distanceFromPrevKm,
        requestedAt: d.requestedAt,
        deadlineAt: d.deadlineAt,
        priority: d.priority,
      };
    });

    const tour = await Tour.create({
      driver: driver._id,
      date: dayStart,
      status: "PLANNED",
      capacityKg: driver.vehicle?.capacityKg || DEFAULT_TRUCK_CAPACITY_KG,
      totalDistanceKm,
      remainingCapacityKg,
      stops: stopDocs,
    });

    // 5) Mark demands as assigned
    await Demand.updateMany(
      { _id: { $in: selected.map((s) => s.demand._id) } },
      {
        $set: {
          status: "SCHEDULED",
          "assigned.driverId": driver._id,
          "assigned.tourId": tour._id,
          "assigned.date": dayStart,
        },
      }
    );

    log(
      `Created tour ${tour._id} for driver ${driver.name} with ${selected.length} stops`
    );

    const populatedTour = await Tour.findById(tour._id).populate(
      "stops.demand"
    );

    res.status(201).json({
      reused: false,
      tour: populatedTour,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /tours/:tourId/stops/:stopId/complete
 * Body: { actualKg, unitsCollected?, notes? }
 */
async function completeStop(req, res, next) {
  try {
    const { tourId, stopId } = req.params;
    const { actualKg, notes } = req.body;

    const tour = await Tour.findById(tourId);
    if (!tour) return res.status(404).json({ error: "Tour not found" });

    const stop = tour.stops.id(stopId);
    if (!stop) return res.status(404).json({ error: "Stop not found" });

    stop.status = "COMPLETED";
    stop.actualKg = actualKg ?? stop.actualKg;
    stop.completedAt = new Date();
    if (notes) stop.notes = notes;

    // mark demand
    await Demand.findByIdAndUpdate(stop.demand, {
      $set: {
        status: "COMPLETED",
      },
    });

    // if all stops done → tour completed
    const allDone = tour.stops.every((s) =>
      ["COMPLETED", "NOT_READY", "PARTIAL"].includes(s.status)
    );
    if (allDone) {
      tour.status = "COMPLETED";
    } else {
      tour.status = "IN_PROGRESS";
    }

    await tour.save();

    res.json({ tour });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /tours/:tourId/stops/:stopId/not-ready
 * Body: { reason? }
 */
async function notReadyStop(req, res, next) {
  try {
    const { tourId, stopId } = req.params;
    const { reason } = req.body;

    const tour = await Tour.findById(tourId);
    if (!tour) return res.status(404).json({ error: "Tour not found" });

    const stop = tour.stops.id(stopId);
    if (!stop) return res.status(404).json({ error: "Stop not found" });

    stop.status = "NOT_READY";
    stop.completedAt = new Date();
    if (reason) stop.notes = reason;

    // release demand so it can be rescheduled later
    await Demand.findByIdAndUpdate(stop.demand, {
      $set: {
        status: "NOT_READY",
        assigned: {},
      },
    });

    const allDone = tour.stops.every((s) =>
      ["COMPLETED", "NOT_READY", "PARTIAL"].includes(s.status)
    );
    tour.status = allDone ? "COMPLETED" : "IN_PROGRESS";

    await tour.save();

    res.json({ tour });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /tours/:tourId/stops/:stopId/partial
 * Body: { actualKg, notes? }
 */
async function partialStop(req, res, next) {
  try {
    const { tourId, stopId } = req.params;
    const { actualKg, notes } = req.body;

    const tour = await Tour.findById(tourId);
    if (!tour) return res.status(404).json({ error: "Tour not found" });

    const stop = tour.stops.id(stopId);
    if (!stop) return res.status(404).json({ error: "Stop not found" });

    stop.status = "PARTIAL";
    stop.actualKg = actualKg;
    stop.completedAt = new Date();
    if (notes) stop.notes = notes;

    await Demand.findByIdAndUpdate(stop.demand, {
      $set: {
        status: "PARTIAL",
      },
    });

    const allDone = tour.stops.every((s) =>
      ["COMPLETED", "NOT_READY", "PARTIAL"].includes(s.status)
    );
    tour.status = allDone ? "COMPLETED" : "IN_PROGRESS";

    await tour.save();

    res.json({ tour });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requestTour,
  completeStop,
  notReadyStop,
  partialStop,
};
