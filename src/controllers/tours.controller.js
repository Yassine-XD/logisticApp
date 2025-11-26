// src/controllers/tours.controller.js
const Driver = require("../models/Driver");
const Tour = require("../models/Tour");
const Demand = require("../models/Demand");
const { log } = require("../utils/logger");

const DEFAULT_TRUCK_CAPACITY_KG = 3200;
const SMALL_TIRE_KG = 8.58;
const MEDIUM_TIRE_KG = 59;

// --- Helper Functions ---

/**
 * Calculate distance between two points using Haversine formula
 */
function distanceKm(a, b) {
  if (!a || !b || !a.lat || !a.lng || !b.lat || !b.lng) {
    return Infinity;
  }

  const R = 6371; // Earth radius in km
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
 * Greedy algorithm to build tour that fills truck capacity
 *
 * Rules:
 * 1. Prioritize by: distance / (1 + priority/50)
 * 2. Keep adding stops until truck is full
 * 3. Stop when remaining capacity < smallest available demand
 */
function buildGreedyTour({ driver, demands, start, capacityKg }) {
  let remainingCapacity = capacityKg;
  let currentPos = start;
  let totalDistanceKm = 0;
  const selected = [];
  const pool = demands.map((d) => ({ ...d, used: false }));

  log(`🚚 Building tour for ${driver.name}`);
  log(`   Capacity: ${capacityKg}kg`);
  log(`   Available demands: ${demands.length}`);
  log(`   Starting from: (${start.lat}, ${start.lng})`);

  let iteration = 0;
  const MAX_ITERATIONS = 100; // Safety limit

  while (remainingCapacity > 0 && iteration < MAX_ITERATIONS) {
    iteration++;

    let best = null;
    let bestIdx = -1;
    let bestScore = Infinity;

    // Find best next demand
    pool.forEach((d, idx) => {
      if (d.used) return;

      // Skip if exceeds remaining capacity
      if (d.qtyEstimatedKg > remainingCapacity) return;

      // Skip if no coordinates
      if (!d.geo?.lat || !d.geo?.lng) return;

      const dist = distanceKm(currentPos, d.geo);
      if (dist === Infinity) return;

      const priority = d.priority || 0;
      const priorityFactor = 1 + priority / 50; // 1..3
      const score = dist / priorityFactor; // Lower is better

      if (score < bestScore) {
        bestScore = score;
        best = d;
        bestIdx = idx;
      }
    });

    // No more demands fit
    if (!best) {
      log(`   ℹ️  No more demands fit in remaining ${remainingCapacity}kg`);
      break;
    }

    // Add stop to tour
    best.used = true;
    remainingCapacity -= best.qtyEstimatedKg;

    const legDistance = distanceKm(currentPos, best.geo);
    totalDistanceKm += legDistance;
    currentPos = best.geo;

    selected.push({
      demand: best,
      distanceFromPrevKm: Number(legDistance.toFixed(2)),
    });

    log(
      `   ✓ Stop ${selected.length}: ${best.garageName} (${
        best.qtyEstimatedKg
      }kg, ${legDistance.toFixed(1)}km, priority: ${best.priority})`
    );
  }

  log(
    `✅ Tour built: ${selected.length} stops, ${totalDistanceKm.toFixed(
      1
    )}km, ${remainingCapacity}kg remaining`
  );

  return {
    remainingCapacityKg: Math.round(remainingCapacity),
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    selected,
  };
}

// --- API Endpoints ---

/**
 * POST /api/drivers/me/tours/request
 *
 * Driver requests a new tour for today
 * Algorithm fills truck capacity optimally
 */
async function requestTour(req, res, next) {
  try {
    // Get driverId from JWT token (set by auth middleware)
    const driverIdFromToken = req.user.driverId;
    const { lat, lng, date } = req.body;

    if (!driverIdFromToken) {
      return res.status(401).json({
        error: "Driver authentication required",
      });
    }

    if (!lat || !lng) {
      return res.status(400).json({
        error: "Current location {lat,lng} is required",
      });
    }

    // Load driver with vehicle
    const driver = await Driver.findById(driverIdFromToken).populate("vehicle");

    if (!driver || !driver.active) {
      return res.status(404).json({
        error: "Driver not found or inactive",
      });
    }

    // CRITICAL: Require vehicle assignment
    if (!driver.vehicle) {
      return res.status(400).json({
        error: "No vehicle assigned to driver",
        message: "Please assign a vehicle before requesting tours",
        driverId: driver._id,
        driverName: driver.name,
      });
    }

    if (!driver.vehicle.active) {
      return res.status(400).json({
        error: "Assigned vehicle is not active",
        vehicleId: driver.vehicle._id,
        vehiclePlate: driver.vehicle.plate,
      });
    }

    log(
      `🚗 Tour request from driver: ${driver.name} (${driver.vehicle.plate})`
    );

    // Date boundaries
    const today = date ? new Date(date) : new Date();
    const dayStart = new Date(today);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(today);
    dayEnd.setHours(23, 59, 59, 999);

    // Check if driver already has an open tour today
    const existingTour = await Tour.findOne({
      driver: driver._id,
      date: { $gte: dayStart, $lte: dayEnd },
      status: { $in: ["PLANNED", "IN_PROGRESS"] },
    }).populate("stops.demand");

    if (existingTour) {
      log(`♻️  Returning existing tour ${existingTour._id}`);
      return res.json({
        reused: true,
        tour: existingTour,
      });
    }

    // Check daily tour limit
    const toursTodayCount = await Tour.countDocuments({
      driver: driver._id,
      date: { $gte: dayStart, $lte: dayEnd },
    });

    const maxDailyTours = driver.maxDailyTours || 3;

    if (toursTodayCount >= maxDailyTours) {
      log(
        `🛑 Driver ${driver.name} reached max daily tours (${toursTodayCount}/${maxDailyTours})`
      );
      return res.status(200).json({
        reused: false,
        info: `Maximum daily tours reached (${toursTodayCount}/${maxDailyTours})`,
        tour: null,
        toursToday: toursTodayCount,
        maxDailyTours: maxDailyTours,
      });
    }

    // Fetch eligible demands from DB
    const demands = await Demand.find({
      estadoCod: { $in: ["EN_CURSO", "ASIGNADA", "EN_TRANSITO"] },
      status: { $in: ["NEW", "CONFIRMED"] },
      "assigned.driverId": { $exists: false },
      "geo.lat": { $exists: true },
      "geo.lng": { $exists: true },
      qtyEstimatedKg: { $gt: 0 },
    })
      .sort({ priority: -1, deadlineAt: 1 })
      .limit(200) // Reasonable limit for performance
      .lean();

    log(`📋 Found ${demands.length} eligible demands`);
    if (!demands.length) {
      return res.status(200).json({
        reused: false,
        info: "No eligible demands available at this time",
        tour: null,
      });
    }

    // Build tour using greedy algorithm
    const startPos = { lat: Number(lat), lng: Number(lng) };
    const capacityKg = driver.vehicle.capacityKg || DEFAULT_TRUCK_CAPACITY_KG;

    const { remainingCapacityKg, totalDistanceKm, selected } = buildGreedyTour({
      driver,
      demands,
      start: startPos,
      capacityKg,
    });

    if (!selected.length) {
      log(`⚠️  No demands fit in truck capacity from current position`);
      return res.status(200).json({
        reused: false,
        info: "No demands fit in current vehicle capacity",
        tour: null,
        capacityKg,
      });
    }

    // Create tour document
    const stopDocs = selected.map((sel, idx) => {
      const d = sel.demand;

      return {
        demand: d._id,
        signusId: d.signusId, // SIGNUS demand code
        signusAlbRec: d.signusAlbRec, // SIGNUS albarán code
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
      capacityKg: capacityKg,
      totalDistanceKm,
      remainingCapacityKg,
      stops: stopDocs,
    });

    // Mark demands as scheduled
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

    log(`✅ Created tour ${tour._id} with ${selected.length} stops`);

    // Populate and return
    const populatedTour = await Tour.findById(tour._id).populate(
      "stops.demand"
    );

    res.status(201).json({
      reused: false,
      tour: populatedTour,
      summary: {
        stops: selected.length,
        totalDistanceKm,
        plannedKg: stopDocs.reduce((sum, s) => sum + s.plannedKg, 0),
        remainingCapacityKg,
        capacityUsedPercent: Math.round(
          ((capacityKg - remainingCapacityKg) / capacityKg) * 100
        ),
      },
    });
  } catch (err) {
    log(`❌ Error in requestTour:`, err.message);
    next(err);
  }
}

/**
 * POST /api/tours/:tourId/start
 *
 * Driver starts the tour
 */
async function startTour(req, res, next) {
  try {
    const { tourId } = req.params;

    const tour = await Tour.findById(tourId);
    if (!tour) {
      return res.status(404).json({ error: "Tour not found" });
    }

    if (tour.status !== "PLANNED") {
      return res.status(400).json({
        error: `Cannot start tour with status: ${tour.status}`,
        currentStatus: tour.status,
      });
    }

    tour.status = "IN_PROGRESS";
    await tour.save();

    log(`🚀 Tour ${tourId} started`);

    res.json({
      success: true,
      tour,
      message: "Tour started successfully",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tours/:tourId/stops/:stopId/complete
 *
 * Driver completes a stop by entering tire counts
 * Backend auto-calculates kg based on tire types
 */
async function completeStop(req, res, next) {
  try {
    const { tourId, stopId } = req.params;
    const { smallTires, mediumTires, notes } = req.body;

    // Validation
    if (smallTires == null || mediumTires == null) {
      return res.status(400).json({
        error: "Both smallTires and mediumTires counts are required",
        example: {
          smallTires: 50,
          mediumTires: 20,
        },
      });
    }

    if (smallTires < 0 || mediumTires < 0) {
      return res.status(400).json({
        error: "Tire counts cannot be negative",
      });
    }

    const tour = await Tour.findById(tourId);
    if (!tour) {
      return res.status(404).json({ error: "Tour not found" });
    }

    const stop = tour.stops.id(stopId);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }

    // Calculate actual kg based on tire counts
    const actualKg = Math.round(
      smallTires * SMALL_TIRE_KG + mediumTires * MEDIUM_TIRE_KG
    );

    // Update stop
    stop.status = "COMPLETED";
    stop.actualKg = actualKg;
    stop.smallTires = smallTires;
    stop.mediumTires = mediumTires;
    stop.completedAt = new Date();
    if (notes) stop.notes = notes;

    // Mark demand as completed
    await Demand.findByIdAndUpdate(stop.demand, {
      $set: { status: "COMPLETED" },
    });

    // Check if all stops are done
    const allDone = tour.stops.every((s) =>
      ["COMPLETED", "NOT_READY", "PARTIAL"].includes(s.status)
    );

    tour.status = allDone ? "COMPLETED" : "IN_PROGRESS";

    // Save and recalculate totals
    await tour.save();

    log(
      `✓ Stop ${stopId} completed: ${smallTires} small + ${mediumTires} medium = ${actualKg}kg`
    );

    res.json({
      success: true,
      tour,
      stopSummary: {
        plannedKg: stop.plannedKg,
        actualKg,
        smallTires,
        mediumTires,
        difference: actualKg - stop.plannedKg,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tours/:tourId/stops/:stopId/not-ready
 *
 * Driver marks stop as not ready (garage closed, etc.)
 * Demand is released and can be reassigned
 */
async function notReadyStop(req, res, next) {
  try {
    const { tourId, stopId } = req.params;
    const { reason } = req.body;

    const tour = await Tour.findById(tourId);
    if (!tour) {
      return res.status(404).json({ error: "Tour not found" });
    }

    const stop = tour.stops.id(stopId);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }

    stop.status = "NOT_READY";
    stop.completedAt = new Date();
    if (reason) stop.notes = reason;

    // Release demand so it can be picked up by another driver
    await Demand.findByIdAndUpdate(stop.demand, {
      $set: { status: "NOT_READY" },
      $unset: { assigned: "" },
    });

    const allDone = tour.stops.every((s) =>
      ["COMPLETED", "NOT_READY", "PARTIAL"].includes(s.status)
    );
    tour.status = allDone ? "COMPLETED" : "IN_PROGRESS";

    await tour.save();

    log(`⚠️  Stop ${stopId} marked NOT_READY: ${reason || "no reason given"}`);

    res.json({
      success: true,
      tour,
      message: "Stop marked as not ready. Demand has been released.",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tours/:tourId/stops/:stopId/partial
 *
 * Driver collects partial amount (garage had less than expected)
 */
async function partialStop(req, res, next) {
  try {
    const { tourId, stopId } = req.params;
    const { smallTires, mediumTires, notes } = req.body;

    // Validation
    if (smallTires == null || mediumTires == null) {
      return res.status(400).json({
        error: "Both smallTires and mediumTires counts are required",
      });
    }

    if (smallTires < 0 || mediumTires < 0) {
      return res.status(400).json({
        error: "Tire counts cannot be negative",
      });
    }

    const tour = await Tour.findById(tourId);
    if (!tour) {
      return res.status(404).json({ error: "Tour not found" });
    }

    const stop = tour.stops.id(stopId);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }

    // Calculate actual kg
    const actualKg = Math.round(
      smallTires * SMALL_TIRE_KG + mediumTires * MEDIUM_TIRE_KG
    );

    stop.status = "PARTIAL";
    stop.actualKg = actualKg;
    stop.smallTires = smallTires;
    stop.mediumTires = mediumTires;
    stop.completedAt = new Date();
    if (notes) stop.notes = notes;

    await Demand.findByIdAndUpdate(stop.demand, {
      $set: { status: "PARTIAL" },
    });

    const allDone = tour.stops.every((s) =>
      ["COMPLETED", "NOT_READY", "PARTIAL"].includes(s.status)
    );
    tour.status = allDone ? "COMPLETED" : "IN_PROGRESS";

    await tour.save();

    log(
      `⚠️  Stop ${stopId} partially completed: ${actualKg}kg (planned: ${stop.plannedKg}kg)`
    );

    res.json({
      success: true,
      tour,
      stopSummary: {
        plannedKg: stop.plannedKg,
        actualKg,
        smallTires,
        mediumTires,
        shortage: stop.plannedKg - actualKg,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tours/:tourId
 *
 * Get tour details
 */
async function getTour(req, res, next) {
  try {
    const { tourId } = req.params;

    const tour = await Tour.findById(tourId)
      .populate("driver")
      .populate("stops.demand");

    if (!tour) {
      return res.status(404).json({ error: "Tour not found" });
    }

    res.json({ tour });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/drivers/:driverId/tours
 *
 * Get all tours for a driver (with date filter)
 */
async function getDriverTours(req, res, next) {
  try {
    const { driverId } = req.params;
    const { date, status } = req.query;

    const filter = { driver: driverId };

    if (date) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      filter.date = { $gte: dayStart, $lte: dayEnd };
    }

    if (status) {
      filter.status = status;
    }

    const tours = await Tour.find(filter)
      .populate("stops.demand")
      .sort({ date: -1, createdAt: -1 });

    res.json({
      tours,
      count: tours.length,
    });
  } catch (err) {
    next(err);
  }
}

async function getActiveTours(req, res, next) {
  try {
    const { date } = req.query;

    const queryDate = date ? new Date(date) : new Date();
    const dayStart = new Date(queryDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(queryDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Find all active tours (PLANNED or IN_PROGRESS) for the date
    const tours = await Tour.find({
      status: { $in: ["PLANNED", "IN_PROGRESS"] },
    })
      .populate({
        path: "driver",
        populate: { path: "vehicle" },
      })
      .populate({
        path: "stops.demand",
        select:
          "garageName garageId geo address contact qtyEstimatedKg requestedAt deadlineAt",
      })
      .sort({ createdAt: 1 });

    // Transform tours to match the mockup format
    const activeTours = tours.map((tour) => {
      const completedStops = tour.stops.filter((s) =>
        ["COMPLETED", "PARTIAL"].includes(s.status)
      ).length;

      const totalStops = tour.stops.length;

      // Find the current/next stop
      const nextStop = tour.stops.find((s) => s.status === "SCHEDULED");
      const inProgressStop = tour.stops.find((s) => s.status === "IN_PROGRESS");
      const currentStop = inProgressStop || nextStop;

      // Calculate estimated completion time (rough estimate)
      const avgMinutesPerStop = 45; // average time per stop
      const remainingStops = totalStops - completedStops;
      const estimatedMinutesLeft = remainingStops * avgMinutesPerStop;
      const estimatedCompletion = new Date(
        Date.now() + estimatedMinutesLeft * 60000
      );

      // Current location (last completed stop or first stop)
      let currentLocation = null;
      if (completedStops > 0) {
        const lastCompleted = tour.stops
          .filter((s) => ["COMPLETED", "PARTIAL"].includes(s.status))
          .pop();
        currentLocation = lastCompleted?.geo || null;
      } else if (tour.stops[0]?.geo) {
        currentLocation = tour.stops[0].geo;
      }

      // Transform stops
      const stops = tour.stops.map((stop, index) => {
        // Calculate ETA for scheduled stops
        let eta = null;
        if (stop.status === "SCHEDULED") {
          const stopsUntilThis = tour.stops
            .slice(0, index)
            .filter((s) => !["COMPLETED", "PARTIAL"].includes(s.status)).length;
          const minutesUntil = stopsUntilThis * avgMinutesPerStop;
          eta = new Date(Date.now() + minutesUntil * 60000)
            .toTimeString()
            .slice(0, 5);
        }

        return {
          id: stop._id.toString(),
          name: stop.garageName || "Unknown Garage",
          address: stop.address
            ? `${stop.address.street || ""}, ${stop.address.city || ""}`.trim()
            : "Address not available",
          phone: stop.contact?.phone || "N/A",
          kg: stop.plannedKg || 0,
          status: stop.status,
          completedAt: stop.completedAt
            ? new Date(stop.completedAt).toTimeString().slice(0, 5)
            : null,
          eta: stop.status === "SCHEDULED" ? eta : null,
          actualKg: stop.actualKg,
          notes: stop.notes,
          geo: stop.geo,
        };
      });

      return {
        id: tour._id.toString(),
        driver: tour.driver?.name || "Unknown Driver",
        driverId: tour.driver?._id.toString(),
        vehicle: tour.driver?.vehicle?.plate || "N/A",
        status: tour.status,
        completedStops,
        totalStops,
        estimatedCompletion: estimatedCompletion.toTimeString().slice(0, 5),
        currentLocation,
        nextStop: currentStop
          ? {
              id: currentStop._id.toString(),
              name: currentStop.garageName || "Unknown Garage",
              eta:
                currentStop.status === "SCHEDULED"
                  ? new Date(Date.now() + avgMinutesPerStop * 60000)
                      .toTimeString()
                      .slice(0, 5)
                  : "Now",
            }
          : null,
        capacityKg: tour.capacityKg,
        remainingCapacityKg: tour.remainingCapacityKg,
        totalDistanceKm: tour.totalDistanceKm,
        stops,
      };
    });

    res.json({
      date: queryDate.toISOString().split("T")[0],
      total: activeTours.length,
      tours: activeTours,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requestTour,
  startTour,
  completeStop,
  notReadyStop,
  partialStop,
  getTour,
  getDriverTours,
  getActiveTours,
};
