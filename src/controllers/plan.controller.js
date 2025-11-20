const Driver = require("../models/Driver");
const { getPlanningDemands } = require("../services/ready.demands.service");
const { saveGreedyTours } = require("../services/planning.service");
const { log } = require("../utils/logger");

const DEFAULT_TRUCK_CAPACITY_KG = 3200; // fallback if vehicle has no capacity

// Haversine distance in km
function distanceKm(a, b) {
  const R = 6371; // earth radius km
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
 * Core greedy algorithm
 * drivers: [{ id, name, capacityKg, start: {lat,lng}, maxStopsPerTour? }]
 * demands: [{ id, kg, lat, lng, priority, requestedAt, deadlineAt, ... }]
 */
function buildGreedyTours(drivers, demands) {
  const remainingDemands = demands.map((d) => ({ ...d, assigned: false }));
  const tours = [];
  const now = Date.now();

  for (const driver of drivers) {
    let remainingCapacity = driver.capacityKg || DEFAULT_TRUCK_CAPACITY_KG;
    let currentPos = driver.start;
    const stops = [];
    let totalDistanceKm = 0;
    const maxStops = driver.maxStopsPerTour || Infinity;

    while (true) {
      // hard stop by max stops per tour
      if (stops.length >= maxStops) break;

      let best = null;
      let bestScore = Infinity;

      remainingDemands.forEach((d) => {
        if (d.assigned) return;
        if (d.kg > remainingCapacity) return;
        if (!d.lat || !d.lng) return;

        const dist = distanceKm(currentPos, { lat: d.lat, lng: d.lng });

        // ---- URGENCY & AGE ----
        const deadlineAt = d.deadlineAt ? new Date(d.deadlineAt) : null;
        const requestedAt = d.requestedAt ? new Date(d.requestedAt) : null;

        const daysToDeadline =
          d.daysToDeadline ??
          (deadlineAt ? (deadlineAt.getTime() - now) / 86400000 : 365);

        const ageDays =
          d.ageDays ??
          (requestedAt ? (now - requestedAt.getTime()) / 86400000 : 0);

        // Urgency factor: closer to expiry → higher factor
        let urgencyFactor = 1;
        if (daysToDeadline <= 0) urgencyFactor = 3.0; // overdue
        else if (daysToDeadline <= 1)
          urgencyFactor = 2.5; // expires today/tomorrow
        else if (daysToDeadline <= 3) urgencyFactor = 2.0; // within 3 days
        else if (daysToDeadline <= 7) urgencyFactor = 1.5; // within a week

        // Age factor: older demands → more weight (cap at 30 days)
        const cappedAge = Math.min(Math.max(ageDays, 0), 30); // 0..30
        const ageFactor = 1 + cappedAge / 30; // 1..2

        // Optional: extra business priority (0..100)
        const rawPriority = d.priority || 0;
        const priorityFactor = 1 + rawPriority / 100; // 1..2

        // Final score: minimize this
        // distance is the base, urgency/age/priority reduce the score
        const score = dist / (urgencyFactor * ageFactor * priorityFactor);

        if (score < bestScore) {
          bestScore = score;
          best = d;
        }
      });

      if (!best) break;

      best.assigned = true;
      remainingCapacity -= best.kg;

      const legDistance = distanceKm(currentPos, {
        lat: best.lat,
        lng: best.lng,
      });
      totalDistanceKm += legDistance;
      currentPos = { lat: best.lat, lng: best.lng };

      stops.push({
        demandId: best.id, // must be rec._id in ready.demands.service
        signusCodigo: best.signusCodigo,
        garageId: best.garageId,
        garageName: best.garageName,
        kg: best.kg,
        lat: best.lat,
        lng: best.lng,
        order: stops.length + 1,
        distanceFromPrevKm: Number(legDistance.toFixed(2)),
        requestedAt: best.requestedAt,
        deadlineAt: best.deadlineAt,
        ageDays:
          best.ageDays ??
          (best.requestedAt
            ? (now - new Date(best.requestedAt).getTime()) / 86400000
            : null),
        daysToDeadline:
          best.daysToDeadline ??
          (best.deadlineAt
            ? (new Date(best.deadlineAt).getTime() - now) / 86400000
            : null),
        priority: best.priority,
        contact: {
          phone: best.contactPhone,
        },
        address: best.address,
      });
    }

    tours.push({
      driverId: driver.id,
      driverName: driver.name,
      capacityKg: driver.capacityKg,
      date: driver.date,
      totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
      totalStops: stops.length,
      remainingCapacityKg: remainingCapacity,
      stops,
    });
  }

  return tours;
}

// POST /api/plan/greedy
async function planGreedy(req, res, next) {
  try {
    const {
      date, // "2025-11-20"
      driverIds, // [mongoId, mongoId]
      depot, // optional: { lat, lng }
    } = req.body;

    if (!date) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }
    if (!Array.isArray(driverIds) || driverIds.length === 0) {
      return res
        .status(400)
        .json({ error: "driverIds must be a non-empty array" });
    }

    // 1) Load drivers (+ vehicles if needed)
    const drivers = await Driver.find({ _id: { $in: driverIds } }).populate(
      "vehicle"
    );

    if (!drivers.length) {
      return res.status(404).json({ error: "No drivers found for given ids" });
    }

    // default depot if none provided (use your CRC from Signus)
    const defaultDepot = depot || {
      lat: 41.573, // TODO: replace with real coords for C/ dels Blanquers 13
      lng: 1.64,
    };

    const plannerDrivers = drivers.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      capacityKg:
        d.vehicle && d.vehicle.capacityKg
          ? d.vehicle.capacityKg
          : DEFAULT_TRUCK_CAPACITY_KG,
      start: defaultDepot,
      date,
      maxStopsPerTour: d.maxStopsPerTour || undefined,
    }));

    // 2) Load planning demands from Mongo (pre-filtered from SignusAlbRec)
    const planningDemands = await getPlanningDemands({ date });

    if (!planningDemands.length) {
      return res.status(200).json({
        date,
        tours: [],
        info: "No planning demands available for this date",
      });
    }

    // 3) Build greedy tours in memory
    const toursDraft = buildGreedyTours(plannerDrivers, planningDemands);

    // 4) Persist tours + mark demands as assigned
    const savedTours = await saveGreedyTours(toursDraft);

    log(
      `Greedy planner built & saved ${savedTours.length} tours for ${plannerDrivers.length} drivers and ${planningDemands.length} demands`
    );

    res.json({
      date,
      drivers: plannerDrivers.map((d) => ({
        id: d.id,
        name: d.name,
        capacityKg: d.capacityKg,
        maxStopsPerTour: d.maxStopsPerTour,
      })),
      totalDemands: planningDemands.length,
      tours: savedTours,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  planGreedy,
};
