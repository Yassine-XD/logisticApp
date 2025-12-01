// src/controllers/plan.controller.advanced.js
const Driver = require("../models/Driver");
const { getPlanningDemands } = require("../services/demands.service");
const { log } = require("../utils/logger");

const DEFAULT_TRUCK_CAPACITY_KG = 3200;
const MIN_CAPACITY_FILL = 0.8; // 80% minimum fill
const MAX_URGENT_TOURS_PER_DRIVER = 4; // Max urgent tours per driver

// Haversine distance in km
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
 * Group garages by deadline date
 */
function groupByDeadline(garages) {
  const groups = {};

  garages.forEach((garage) => {
    if (!garage.deadlineAt) return;

    const dateKey = new Date(garage.deadlineAt).toISOString().split("T")[0];
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(garage);
  });

  // Sort groups by date (earliest first)
  const sortedGroups = Object.keys(groups)
    .sort()
    .map((dateKey) => ({
      date: dateKey,
      garages: groups[dateKey],
      isUrgent: isUrgentDate(dateKey),
    }));

  return sortedGroups;
}

/**
 * Check if date is urgent (today or tomorrow)
 */
function isUrgentDate(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return date <= tomorrow;
}

/**
 * Find closest garage to a given position
 */
function findClosestGarage(position, availableGarages) {
  let closest = null;
  let minDist = Infinity;

  availableGarages.forEach((garage) => {
    if (!garage.lat || !garage.lng) return;

    const dist = distanceKm(position, { lat: garage.lat, lng: garage.lng });
    if (dist < minDist) {
      minDist = dist;
      closest = garage;
    }
  });

  return { garage: closest, distance: minDist };
}

/**
 * Build a single tour optimally
 * Strategy:
 * 1. Start with highest kg garage (fills truck more)
 * 2. Add nearby garages to fill capacity
 * 3. Prefer fewer stops
 */
function buildOptimalTour(availableGarages, capacity, depot) {
  if (!availableGarages.length) return null;

  const tour = {
    stops: [],
    totalKg: 0,
    totalDistance: 0,
    capacityUsed: 0,
  };

  // Sort by kg descending (biggest first)
  const sorted = [...availableGarages].sort((a, b) => b.kg - a.kg);

  let currentPos = depot;
  const used = new Set();

  // Start with biggest garage that fits
  for (const garage of sorted) {
    if (garage.kg <= capacity && garage.lat && garage.lng) {
      const dist = distanceKm(currentPos, { lat: garage.lat, lng: garage.lng });

      tour.stops.push({
        garage,
        distanceFromPrev: dist,
      });

      tour.totalKg += garage.kg;
      tour.totalDistance += dist;
      currentPos = { lat: garage.lat, lng: garage.lng };
      used.add(garage.id);
      break;
    }
  }

  if (!tour.stops.length) return null;

  // Fill remaining capacity with closest garages
  const remainingCapacity = capacity - tour.totalKg;
  const available = availableGarages.filter((g) => !used.has(g.id));

  while (tour.totalKg < capacity * MIN_CAPACITY_FILL && available.length > 0) {
    const { garage, distance } = findClosestGarage(currentPos, available);

    if (!garage) break;

    // Check if it fits
    if (tour.totalKg + garage.kg <= capacity) {
      tour.stops.push({
        garage,
        distanceFromPrev: distance,
      });

      tour.totalKg += garage.kg;
      tour.totalDistance += distance;
      currentPos = { lat: garage.lat, lng: garage.lng };
      used.add(garage.id);

      // Remove from available
      const idx = available.findIndex((g) => g.id === garage.id);
      if (idx >= 0) available.splice(idx, 1);
    } else {
      // Try to find smaller garage that fits
      const smaller = available.find(
        (g) => g.kg <= capacity - tour.totalKg && g.kg > 0
      );

      if (smaller) {
        const dist = distanceKm(currentPos, {
          lat: smaller.lat,
          lng: smaller.lng,
        });

        tour.stops.push({
          garage: smaller,
          distanceFromPrev: dist,
        });

        tour.totalKg += smaller.kg;
        tour.totalDistance += dist;
        currentPos = { lat: smaller.lat, lng: smaller.lng };
        used.add(smaller.id);

        const idx = available.findIndex((g) => g.id === smaller.id);
        if (idx >= 0) available.splice(idx, 1);
      } else {
        break; // No more garages fit
      }
    }
  }

  tour.capacityUsed = (tour.totalKg / capacity) * 100;

  return tour;
}

/**
 * Build all tours from garages
 */
function buildAllTours(deadlineGroups, capacity, depot) {
  const allTours = [];

  // Process each deadline group (earliest first)
  deadlineGroups.forEach((group) => {
    const availableGarages = [...group.garages];
    const groupTours = [];

    while (availableGarages.length > 0) {
      const tour = buildOptimalTour(availableGarages, capacity, depot);

      if (!tour) break;

      // Remove used garages
      tour.stops.forEach((stop) => {
        const idx = availableGarages.findIndex((g) => g.id === stop.garage.id);
        if (idx >= 0) {
          availableGarages.splice(idx, 1);
        }
      });

      // Tag tour with deadline and urgency
      tour.deadline = group.date;
      tour.isUrgent = group.isUrgent;

      groupTours.push(tour);
    }

    log(
      `Built ${groupTours.length} tours for deadline ${group.date} (${
        group.isUrgent ? "URGENT" : "normal"
      })`
    );

    allTours.push(...groupTours);
  });

  return allTours;
}

/**
 * Distribute tours fairly among drivers
 * Rules:
 * - Equal distribution
 * - Max 3-4 urgent tours per driver
 */
function distributeTours(tours, drivers) {
  const distribution = drivers.map((d) => ({
    driver: d,
    tours: [],
    urgentCount: 0,
  }));

  // Sort tours: urgent first
  const sortedTours = [...tours].sort((a, b) => {
    if (a.isUrgent && !b.isUrgent) return -1;
    if (!a.isUrgent && b.isUrgent) return 1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  // Distribute tours
  let driverIndex = 0;

  sortedTours.forEach((tour) => {
    // Find driver with space for this tour
    let assigned = false;
    let attempts = 0;

    while (!assigned && attempts < drivers.length) {
      const driver = distribution[driverIndex];

      // Check urgent constraint
      if (tour.isUrgent && driver.urgentCount >= MAX_URGENT_TOURS_PER_DRIVER) {
        // Try next driver
        driverIndex = (driverIndex + 1) % drivers.length;
        attempts++;
        continue;
      }

      // Assign tour
      driver.tours.push(tour);
      if (tour.isUrgent) {
        driver.urgentCount++;
      }

      assigned = true;

      // Move to next driver (round-robin)
      driverIndex = (driverIndex + 1) % drivers.length;
    }

    if (!assigned) {
      log(`Warning: Could not assign tour with deadline ${tour.deadline}`);
    }
  });

  return distribution;
}

/**
 * Format tours for API response
 */
function formatToursForResponse(distribution, date) {
  return distribution.map((d) => ({
    driverId: d.driver.id,
    driverName: d.driver.name,
    capacityKg: d.driver.capacityKg,
    date,
    totalTours: d.tours.length,
    urgentTours: d.urgentCount,
    tours: d.tours.map((tour, idx) => ({
      tourNumber: idx + 1,
      deadline: tour.deadline,
      isUrgent: tour.isUrgent,
      totalStops: tour.stops.length,
      totalKg: Math.round(tour.totalKg),
      capacityUsed: Math.round(tour.capacityUsed),
      totalDistanceKm: Number(tour.totalDistance.toFixed(2)),
      stops: tour.stops.map((stop, stopIdx) => ({
        order: stopIdx + 1,
        garageId: stop.garage.garageId,
        garageName: stop.garage.garageName,
        kg: stop.garage.kg,
        lat: stop.garage.lat,
        lng: stop.garage.lng,
        address: stop.garage.address,
        contact: stop.garage.contactPhone
          ? { phone: stop.garage.contactPhone }
          : undefined,
        distanceFromPrevKm: Number(stop.distanceFromPrev.toFixed(2)),
        requestedAt: stop.garage.requestedAt,
        deadlineAt: stop.garage.deadlineAt,
        priority: stop.garage.priority,
      })),
    })),
  }));
}

/**
 * POST /api/plan/greedy-advanced
 * Advanced greedy planning with all new rules
 */
async function planGreedyAdvanced(req, res, next) {
  try {
    const { date, driverIds, depot } = req.body;

    if (!date) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    if (!Array.isArray(driverIds) || driverIds.length === 0) {
      return res
        .status(400)
        .json({ error: "driverIds must be a non-empty array" });
    }

    // 1. Load drivers + vehicles
    const drivers = await Driver.find({ _id: { $in: driverIds } }).populate(
      "vehicle"
    );

    if (!drivers.length) {
      return res.status(404).json({ error: "No drivers found for given ids" });
    }

    // Default depot (your CRC location)
    const defaultDepot = depot || {
      lat: 41.573,
      lng: 1.64,
    };

    const plannerDrivers = drivers.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      capacityKg:
        d.vehicle && d.vehicle.capacityKg
          ? d.vehicle.capacityKg
          : DEFAULT_TRUCK_CAPACITY_KG,
    }));

    // Use average capacity for tour building
    const avgCapacity =
      plannerDrivers.reduce((sum, d) => sum + d.capacityKg, 0) /
      plannerDrivers.length;

    // 2. Load planning demands
    const planningDemands = await getPlanningDemands({ date });

    if (!planningDemands.length) {
      return res.status(200).json({
        date,
        drivers: plannerDrivers,
        totalGarages: 0,
        totalTours: 0,
        distribution: [],
        message: "No planning demands available for this date",
      });
    }

    log(
      `Advanced greedy: Planning for ${driverIds.length} drivers with ${planningDemands.length} garages`
    );

    // 3. Group garages by deadline
    const deadlineGroups = groupByDeadline(planningDemands);

    log(
      `Grouped into ${deadlineGroups.length} deadline groups:`,
      deadlineGroups.map((g) => ({
        date: g.date,
        count: g.garages.length,
        urgent: g.isUrgent,
      }))
    );

    // 4. Build tours
    const allTours = buildAllTours(deadlineGroups, avgCapacity, defaultDepot);

    log(`Built ${allTours.length} total tours`);

    if (!allTours.length) {
      return res.status(200).json({
        date,
        drivers: plannerDrivers,
        totalGarages: planningDemands.length,
        totalTours: 0,
        distribution: [],
        message: "Could not build any tours from available demands",
      });
    }

    // 5. Distribute tours fairly
    const distribution = distributeTours(allTours, plannerDrivers);

    log(
      "Distribution:",
      distribution.map((d) => ({
        driver: d.driver.name,
        tours: d.tours.length,
        urgent: d.urgentCount,
      }))
    );

    // 6. Format response
    const formattedDistribution = formatToursForResponse(distribution, date);

    // Statistics
    const stats = {
      totalGarages: planningDemands.length,
      totalTours: allTours.length,
      urgentTours: allTours.filter((t) => t.isUrgent).length,
      averageStopsPerTour:
        allTours.reduce((sum, t) => sum + t.stops.length, 0) / allTours.length,
      averageCapacityUsed:
        allTours.reduce((sum, t) => sum + t.capacityUsed, 0) / allTours.length,
      totalDistanceKm: allTours.reduce((sum, t) => sum + t.totalDistance, 0),
    };

    res.json({
      date,
      drivers: plannerDrivers.map((d) => ({
        id: d.id,
        name: d.name,
        capacityKg: d.capacityKg,
      })),
      stats: {
        ...stats,
        averageStopsPerTour: Number(stats.averageStopsPerTour.toFixed(1)),
        averageCapacityUsed: Number(stats.averageCapacityUsed.toFixed(1)),
        totalDistanceKm: Number(stats.totalDistanceKm.toFixed(2)),
      },
      distribution: formattedDistribution,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  planGreedyAdvanced,
};
