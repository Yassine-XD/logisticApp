// src/controllers/plan.controller.js
const Driver = require("../models/Driver");
const Vehicle = require("../models/Vehicle");
const { getPlanningDemands } = require("../services/demands.service");
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
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return R * c;
}

/**
 * Core greedy algorithm
 * drivers: [{ id, name, capacityKg, start: {lat,lng} }]
 * demands: [{ id, kg, lat, lng, priority }]
 */
function buildGreedyTours(drivers, demands) {
  const remainingDemands = demands.map((d) => ({ ...d, assigned: false }));
  const tours = [];

  for (const driver of drivers) {
    let remainingCapacity = driver.capacityKg || DEFAULT_TRUCK_CAPACITY_KG;
    let currentPos = driver.start;
    const stops = [];
    let totalDistanceKm = 0;

    while (true) {
      let best = null;
      let bestIndex = -1;
      let bestScore = Infinity;

      remainingDemands.forEach((d, idx) => {
        if (d.assigned) return;
        if (d.kg > remainingCapacity) return;
        if (!d.lat || !d.lng) return;

        const dist = distanceKm(currentPos, { lat: d.lat, lng: d.lng });

        // Priority factor: 1..3 (higher priority => bigger factor)
        const priority = d.priority || 0; // 0..100
        const priorityFactor = 1 + priority / 50; // priority 0 => 1, 50 => 2, 100 => 3

        // final score = distance / priorityFactor
        const score = dist / priorityFactor;

        if (score < bestScore) {
          bestScore = score;
          best = d;
          bestIndex = idx;
        }
      });

      if (!best) break;

      best.assigned = true;
      remainingCapacity -= best.kg;

      const legDistance = distanceKm(currentPos, { lat: best.lat, lng: best.lng });
      totalDistanceKm += legDistance;
      currentPos = { lat: best.lat, lng: best.lng };

      stops.push({
        demandId: best.id,
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
        ageDays: best.ageDays,
        daysToDeadline: best.daysToDeadline,
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
      date,          // "2025-11-20"
      driverIds,     // [mongoId, mongoId]
      depot,         // optional: { lat, lng }
    } = req.body;

    if (!date) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }
    if (!Array.isArray(driverIds) || driverIds.length === 0) {
      return res.status(400).json({ error: "driverIds must be a non-empty array" });
    }

    // 1) Load drivers + vehicles
    const drivers = await Driver.find({ _id: { $in: driverIds } }).populate("vehicle");

    if (!drivers.length) {
      return res.status(404).json({ error: "No drivers found for given ids" });
    }

    // default depot if none provided (use your CRC from Signus)
    const defaultDepot = depot || {
      lat: 41.573,   // TODO: replace with real coords for C/ dels Blanquers 13
      lng: 1.640,
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
    }));

    // 2) Load planning demands
    //    You can tune this function inside demands.service:
    //    e.g. only EN_CURSO, ASIGNADA, EN_TRANSITO; not completed.
    const planningDemands = await getPlanningDemands({ date });

    if (!planningDemands.length) {
      return res.status(200).json({
        tours: [],
        info: "No planning demands available for this date",
      });
    }

    // 3) Build greedy tours
    const tours = buildGreedyTours(plannerDrivers, planningDemands);

    log(
      `Greedy planner built ${tours.length} tours for ${plannerDrivers.length} drivers and ${planningDemands.length} demands`
    );

    res.json({
      date,
      drivers: plannerDrivers.map((d) => ({
        id: d.id,
        name: d.name,
        capacityKg: d.capacityKg,
      })),
      totalDemands: planningDemands.length,
      tours,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  planGreedy,
};
