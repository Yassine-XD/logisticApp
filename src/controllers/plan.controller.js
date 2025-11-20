// src/controllers/plan.controller.js
const Driver = require("../models/Driver");
const Vehicle = require("../models/Vehicle");
const { getPlanningDemands } = require("../services/demands.service");
const { log } = require("../utils/logger");

const DEFAULT_TRUCK_CAPACITY_KG = 3200;

// Haversine distance in km
function distanceKm(a, b) {
  if (!a || !b || !a.lat || !a.lng || !b.lat || !b.lng) {
    return Infinity;
  }

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
 * FIX #10: Improved greedy algorithm with validation
 * 
 * Core greedy algorithm for multi-driver planning
 * drivers: [{ id, name, capacityKg, start: {lat,lng} }]
 * demands: [{ id, kg, lat, lng, priority }]
 */
function buildGreedyTours(drivers, demands) {
  const remainingDemands = demands.map((d) => ({ ...d, assigned: false }));
  const tours = [];

  log(`🗺️  Planning for ${drivers.length} drivers, ${demands.length} demands`);

  for (const driver of drivers) {
    let remainingCapacity = driver.capacityKg || DEFAULT_TRUCK_CAPACITY_KG;
    let currentPos = driver.start;
    const stops = [];
    let totalDistanceKm = 0;

    log(`  🚚 Planning for driver: ${driver.name} (${remainingCapacity}kg capacity)`);

    while (true) {
      let best = null;
      let bestIndex = -1;
      let bestScore = Infinity;

      remainingDemands.forEach((d, idx) => {
        if (d.assigned) return;
        if (d.kg > remainingCapacity) return;
        
        // FIX #10: Validate coordinates
        if (!d.lat || !d.lng) return;

        const dist = distanceKm(currentPos, { lat: d.lat, lng: d.lng });
        
        if (dist === Infinity) return;

        // Priority factor: 1..3 (higher priority => bigger factor)
        const priority = d.priority || 0; // 0..100
        const priorityFactor = 1 + priority / 50;

        // Final score = distance / priorityFactor
        // Lower score is better (closer + higher priority)
        const score = dist / priorityFactor;

        if (score < bestScore) {
          bestScore = score;
          best = d;
          bestIndex = idx;
        }
      });

      // No more feasible demands
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

    log(`    ✓ ${stops.length} stops, ${totalDistanceKm.toFixed(1)}km, ${remainingCapacity}kg remaining`);

    tours.push({
      driverId: driver.id,
      driverName: driver.name,
      capacityKg: driver.capacityKg,
      date: driver.date,
      totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
      totalStops: stops.length,
      remainingCapacityKg: Math.round(remainingCapacity),
      stops,
    });
  }

  const assignedCount = remainingDemands.filter(d => d.assigned).length;
  log(`✅ Planning complete: ${assignedCount}/${demands.length} demands assigned`);

  return tours;
}

/**
 * POST /api/plan/greedy
 * Body: { date, driverIds, depot? }
 */
async function planGreedy(req, res, next) {
  try {
    const {
      date,       // "2025-11-20"
      driverIds,  // [mongoId, mongoId]
      depot,      // optional: { lat, lng }
    } = req.body;

    // Validation
    if (!date) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }
    if (!Array.isArray(driverIds) || driverIds.length === 0) {
      return res.status(400).json({ error: "driverIds must be a non-empty array" });
    }

    log(`📅 Planning greedy tours for date: ${date}`);

    // 1) Load drivers + vehicles
    const drivers = await Driver.find({ 
      _id: { $in: driverIds },
      active: true 
    }).populate("vehicle");

    if (!drivers.length) {
      return res.status(404).json({ 
        error: "No active drivers found for given ids" 
      });
    }

    // Default depot (CRC location - replace with your actual coords)
    const defaultDepot = depot || {
      lat: 41.6506, // Manresa approximate coordinates
      lng: 1.8366,
    };

    const plannerDrivers = drivers.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      capacityKg:
        d.vehicle && d.vehicle.capacityKg
          ? d.vehicle.capacityKg
          : DEFAULT_TRUCK_CAPACITY_KG,
      start: d.homeBase?.lat && d.homeBase?.lng 
        ? { lat: d.homeBase.lat, lng: d.homeBase.lng }
        : defaultDepot,
      date,
    }));

    log(`🚗 Loaded ${plannerDrivers.length} drivers`);

    // 2) Load planning demands from Signus API
    const planningDemands = await getPlanningDemands({ date });

    if (!planningDemands.length) {
      log("⚠️  No planning demands available");
      return res.status(200).json({
        date,
        drivers: plannerDrivers.map((d) => ({
          id: d.id,
          name: d.name,
          capacityKg: d.capacityKg,
        })),
        totalDemands: 0,
        tours: [],
        info: "No planning demands available for this date",
      });
    }

    log(`📋 Loaded ${planningDemands.length} demands`);

    // 3) Build greedy tours
    const tours = buildGreedyTours(plannerDrivers, planningDemands);

    // 4) Calculate statistics
    const totalAssigned = tours.reduce((sum, t) => sum + t.totalStops, 0);
    const totalDistance = tours.reduce((sum, t) => sum + t.totalDistanceKm, 0);

    log(`✅ Greedy planner: ${totalAssigned}/${planningDemands.length} demands assigned, ${totalDistance.toFixed(1)}km total`);

    res.json({
      date,
      drivers: plannerDrivers.map((d) => ({
        id: d.id,
        name: d.name,
        capacityKg: d.capacityKg,
      })),
      totalDemands: planningDemands.length,
      assignedDemands: totalAssigned,
      unassignedDemands: planningDemands.length - totalAssigned,
      totalDistance: Number(totalDistance.toFixed(2)),
      tours,
    });
  } catch (err) {
    log(`❌ Error in planGreedy:`, err.message);
    next(err);
  }
}

module.exports = {
  planGreedy,
};