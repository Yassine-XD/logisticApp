// src/services/greedy.service.js
// Explicit FALLBACK planner used only when the OR-Tools engine is unreachable.
// Nearest-neighbour, priority-weighted, fills each vehicle to its OWN capacity
// (never an averaged fleet capacity). Produces the same normalized plan shape
// the engine path produces, so downstream (Plan persist / publish) is identical.
const { distanceKm, hasValidGeo } = require("../utils/geo");

function stopFromDemand(demand, seq, distPrev, urgencyThreshold) {
  return {
    demand: demand._id,
    signusId: demand.signusId,
    signusAlbRec: demand.signusAlbRec,
    garageId: demand.garageId,
    garageName: demand.garageName,
    sequence: seq,
    plannedKg: demand.kg,
    geo: { lat: demand.geo.lat, lng: demand.geo.lng },
    address: demand.address,
    contactPhone: demand.contactPhone || demand.contact?.phone || null,
    deadlineAt: demand.deadlineAt,
    requestedAt: demand.requestedAt,
    daysToDeadline: demand.daysToDeadline,
    priority: demand.priority,
    isUrgent: demand.daysToDeadline <= urgencyThreshold,
    distanceFromPrevious: Number.isFinite(distPrev) ? Number(distPrev.toFixed(2)) : 0,
  };
}

/**
 * @param {Object} p
 * @param {Array}  p.demands  plannable demand docs (lean), with geo + metrics
 * @param {Array}  p.drivers  [{ _id, name, vehicle: {_id, plate, capacityKg}, maxDailyTours }]
 * @param {Object} p.depot    { lat, lng }
 * @param {Object} p.settings Settings doc
 * @param {number} p.avgSpeedKmh
 */
function planGreedy({ demands, drivers, depot, settings, avgSpeedKmh = 50 }) {
  const urgencyThreshold = settings?.urgencyThresholdDays ?? 2;
  const maxToursCap = settings?.maxToursPerDriver ?? 3;
  const serviceMin = 15;

  // Pool sorted by priority desc, then earliest deadline
  const pool = demands
    .filter((d) => hasValidGeo(d.geo) && d.kg > 0)
    .map((d) => ({ ...d, _used: false }))
    .sort((a, b) => b.priority - a.priority || a.daysToDeadline - b.daysToDeadline);

  const routes = [];
  let routeCounter = 0;

  for (const driver of drivers) {
    const vehicle = driver.vehicle;
    if (!vehicle || !vehicle.capacityKg) continue;
    const capacity = vehicle.capacityKg;
    const maxTours = Math.min(driver.maxDailyTours || maxToursCap, maxToursCap);

    for (let tourIdx = 0; tourIdx < maxTours; tourIdx++) {
      let remaining = capacity;
      let cursor = depot;
      let totalDistance = 0;
      const stops = [];

      // Fill this tour
      while (true) {
        let best = null;
        let bestScore = Infinity;
        let bestDist = Infinity;
        for (const d of pool) {
          if (d._used) continue;
          if (d.kg > remaining) continue;
          if (!hasValidGeo(d.geo)) continue;
          const dist = distanceKm(cursor, d.geo);
          if (!Number.isFinite(dist)) continue;
          // Lower is better: distance discounted by priority
          const score = dist / (1 + (d.priority || 0) / 50);
          if (score < bestScore) {
            bestScore = score;
            best = d;
            bestDist = dist;
          }
        }
        if (!best) break;
        best._used = true;
        remaining -= best.kg;
        totalDistance += bestDist;
        cursor = best.geo;
        stops.push(stopFromDemand(best, stops.length + 1, bestDist, urgencyThreshold));
      }

      if (!stops.length) break; // driver's pool exhausted → no more tours

      // Return-to-depot leg
      const back = distanceKm(cursor, depot);
      if (Number.isFinite(back)) totalDistance += back;

      const totalKg = stops.reduce((s, x) => s + x.plannedKg, 0);
      const travelH = totalDistance / avgSpeedKmh;
      const serviceH = (stops.length * serviceMin) / 60;
      routes.push({
        routeId: `GREEDY-${driver.name}-T${tourIdx + 1}-${++routeCounter}`,
        driver: driver._id,
        driverName: driver.name,
        vehicle: vehicle._id,
        vehicleId: String(vehicle._id),
        vehiclePlate: vehicle.plate,
        tourIndex: tourIdx,
        capacityKg: capacity,
        totalKg,
        totalDistanceKm: Number(totalDistance.toFixed(2)),
        estimatedDurationHours: Number((travelH + serviceH).toFixed(2)),
        capacityUtilizationPercent: Number(((totalKg / capacity) * 100).toFixed(1)),
        urgentCount: stops.filter((s) => s.isUrgent).length,
        stops,
      });
    }
  }

  const unassigned = pool
    .filter((d) => !d._used)
    .map((d) => stopFromDemand(d, 0, 0, urgencyThreshold));

  const totalAssignedKg = routes.reduce((s, r) => s + r.totalKg, 0);
  const summary = {
    total_routes: routes.length,
    total_stops: routes.reduce((s, r) => s + r.stops.length, 0),
    total_kg: totalAssignedKg,
    total_distance_km: Number(routes.reduce((s, r) => s + r.totalDistanceKm, 0).toFixed(2)),
    assigned_garages: routes.reduce((s, r) => s + r.stops.length, 0),
    unassigned_count: unassigned.length,
    average_capacity_utilization: routes.length
      ? Number((routes.reduce((s, r) => s + r.capacityUtilizationPercent, 0) / routes.length).toFixed(1))
      : 0,
  };

  return {
    algorithm: "greedy-fallback",
    optimizationId: `GREEDY-${Date.now()}`,
    routes,
    unassigned,
    summary,
  };
}

module.exports = { planGreedy };
