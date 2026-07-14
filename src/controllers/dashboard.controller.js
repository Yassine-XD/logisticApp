// src/controllers/dashboard.controller.js
const Tour = require("../models/Tour");
const Demand = require("../models/Demand");
const Settings = require("../models/Settings");

const DAY = 86400000;

function rangeOrToday(from, to) {
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = from ? new Date(from) : new Date(end.getTime() - 6 * DAY);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/** Aggregate collected kg + compliance over completed/partial stops in range. */
async function collectionStats(start, end) {
  const rows = await Tour.aggregate([
    { $match: { date: { $gte: start, $lte: end } } },
    { $unwind: "$stops" },
    { $match: { "stops.status": { $in: ["COMPLETED", "PARTIAL"] } } },
    {
      $group: {
        _id: null,
        kg: { $sum: "$stops.actualKg" },
        stops: { $sum: 1 },
        onTime: {
          $sum: {
            $cond: [{ $lte: ["$stops.completedAt", "$stops.deadlineAt"] }, 1, 0],
          },
        },
      },
    },
  ]);
  const r = rows[0] || { kg: 0, stops: 0, onTime: 0 };
  return {
    kg: r.kg || 0,
    stops: r.stops || 0,
    compliancePct: r.stops ? Math.round((r.onTime / r.stops) * 100) : 100,
  };
}

/** GET /dashboard/kpis?from=&to= */
async function getKpis(req, res, next) {
  try {
    const { start, end } = rangeOrToday(req.query.from, req.query.to);
    const settings = await Settings.getSettings().catch(() => null);
    const threshold = settings?.urgencyThresholdDays ?? 2;

    const [collection, tourAgg, urgentBacklog, daysSpan] = await Promise.all([
      collectionStats(start, end),
      Tour.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: null,
            tours: { $sum: 1 },
            capKg: { $sum: "$capacityKg" },
            actualKg: { $sum: "$totalActualKg" },
            plannedKg: { $sum: "$totalPlannedKg" },
          },
        },
      ]),
      Demand.countDocuments({
        status: { $in: ["NEW", "NOT_READY"] },
        estadoCod: { $in: Demand.PLANNABLE_ESTADOS },
        deadlineAt: { $lte: new Date(Date.now() + threshold * DAY) },
      }),
      Math.max(1, Math.round((end - start) / DAY) + 1),
    ]);

    const t = tourAgg[0] || { tours: 0, capKg: 0, actualKg: 0, plannedKg: 0 };
    const utilBase = t.capKg || 0;
    const capacityUtilizationPct = utilBase
      ? Math.round(((t.plannedKg || 0) / utilBase) * 100)
      : 0;

    res.json({
      range: { from: start.toISOString(), to: end.toISOString() },
      kgCollected: collection.kg,
      stopsCompleted: collection.stops,
      deadlineCompliancePct: collection.compliancePct,
      tours: t.tours,
      toursPerDay: Number((t.tours / daysSpan).toFixed(1)),
      capacityUtilizationPct,
      urgentBacklog,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /dashboard — snapshot for the dashboard page. */
async function getDashboard(req, res, next) {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(todayStart.getTime() - 6 * DAY);

    const settings = await Settings.getSettings().catch(() => null);
    const threshold = settings?.urgencyThresholdDays ?? 2;

    const [today, week, activeTours, urgentBacklog, pendingDemands] = await Promise.all([
      collectionStats(todayStart, todayEnd),
      collectionStats(weekStart, todayEnd),
      Tour.find({
        date: { $gte: todayStart, $lte: todayEnd },
        status: { $in: ["PLANNED", "IN_PROGRESS"] },
      })
        .populate({ path: "driver", populate: { path: "vehicle" } })
        .lean(),
      Demand.countDocuments({
        status: { $in: ["NEW", "NOT_READY"] },
        estadoCod: { $in: Demand.PLANNABLE_ESTADOS },
        deadlineAt: { $lte: new Date(Date.now() + threshold * DAY) },
      }),
      Demand.countDocuments({
        status: { $in: ["NEW", "NOT_READY"] },
        estadoCod: { $in: Demand.PLANNABLE_ESTADOS },
      }),
    ]);

    // Tour markers + polylines for the map
    const tourLocations = activeTours.map((tour) => {
      const completed = tour.stops.filter((s) =>
        ["COMPLETED", "PARTIAL"].includes(s.status)
      ).length;
      return {
        tourId: String(tour._id),
        driverName: tour.driver?.name || "—",
        vehicle: tour.driver?.vehicle?.plate || null,
        status: tour.status,
        completedStops: completed,
        totalStops: tour.stops.length,
        stops: tour.stops
          .filter((s) => s.geo?.lat && s.geo?.lng)
          .map((s) => ({
            name: s.garageName,
            lat: s.geo.lat,
            lng: s.geo.lng,
            status: s.status,
            kg: s.plannedKg,
          })),
      };
    });

    // Recent activity from completed stops today
    const activity = [];
    for (const tour of activeTours) {
      for (const s of tour.stops) {
        if (!s.completedAt) continue;
        activity.push({
          id: String(s._id),
          type: s.status.toLowerCase(),
          driver: tour.driver?.name || "—",
          location: s.garageName,
          kg: s.actualKg,
          timestamp: s.completedAt,
        });
      }
    }
    activity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      kpis: {
        kgToday: today.kg,
        kgWeek: week.kg,
        deadlineCompliancePct: today.compliancePct,
        activeTours: activeTours.length,
        urgentBacklog,
        pendingDemands,
      },
      depot: settings ? settings.depot : null,
      tourLocations,
      activity: activity.slice(0, 15),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getKpis, getDashboard };
