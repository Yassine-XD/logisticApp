// src/controllers/tours.controller.js
const Driver = require("../models/Driver");
const Tour = require("../models/Tour");
const Demand = require("../models/Demand");
const { log } = require("../utils/logger");

const DEFAULT_TRUCK_CAPACITY_KG = 3200;

// --- Helpers ---

function distanceKm(a, b) {
  if (!a || !b || !a.lat || !a.lng || !b.lat || !b.lng) {
    return Infinity;
  }

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
 * FIX #6: Improved greedy algorithm with proper validation
 * 
 * Rules implemented:
 * 1. Prioritize expired/urgent demands (via priority score)
 * 2. Pick closest demands from current position
 * 3. Respect capacity constraints
 * 4. Minimize stops while maximizing load
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

  log(`🚚 Building tour for driver ${driver.name}, capacity: ${remainingCapacity}kg, max stops: ${maxStops}`);

  while (selected.length < maxStops) {
    let best = null;
    let bestIdx = -1;
    let bestScore = Infinity;

    pool.forEach((d, idx) => {
      if (d.used) return;
      
      // Skip if exceeds capacity
      if (d.qtyEstimatedKg > remainingCapacity) return;
      
      // FIX #6: Validate geo coordinates exist
      if (!d.geo?.lat || !d.geo?.lng) {
        log(`⚠️  Skipping demand ${d._id} - missing coordinates`);
        return;
      }

      const dist = distanceKm(currentPos, d.geo);
      
      // Skip if distance calculation failed
      if (dist === Infinity) return;

      const priority = d.priority || 0;

      // Priority factor: 1..3 (higher priority => bigger factor)
      // This means high-priority demands are "virtually closer"
      const priorityFactor = 1 + priority / 50;
      
      // Score: lower is better (distance penalized by priority)
      const score = dist / priorityFactor;

      if (score < bestScore) {
        bestScore = score;
        best = d;
        bestIdx = idx;
      }
    });

    // No more feasible demands
    if (!best) {
      log(`ℹ️  No more demands fit (checked ${pool.length}, selected ${selected.length})`);
      break;
    }

    // Mark as used
    best.used = true;
    remainingCapacity -= best.qtyEstimatedKg;

    const legDistance = distanceKm(currentPos, best.geo);
    totalDistanceKm += legDistance;
    
    // Update current position
    currentPos = best.geo;

    log(`  ✓ Stop ${selected.length + 1}: ${best.garageName} (${best.qtyEstimatedKg}kg, ${legDistance.toFixed(1)}km, priority: ${best.priority})`);

    selected.push({
      demand: best,
      distanceFromPrevKm: Number(legDistance.toFixed(2)),
    });
  }

  log(`✅ Tour built: ${selected.length} stops, ${totalDistanceKm.toFixed(1)}km, ${remainingCapacity}kg remaining`);

  return {
    remainingCapacityKg: Math.round(remainingCapacity),
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    selected,
  };
}

// --- Controllers ---

/**
 * FIX #7: Request tour with proper demand filtering
 * 
 * POST /api/drivers/me/tours/request
 * Body: { driverId, lat, lng, date? }
 * 
 * Rules implemented:
 * - Include expired demands (driver gets them first via priority)
 * - Filter by proximity and priority
 * - Respect daily tour limits
 * - Validate all coordinates
 */
async function requestTour(req, res, next) {
  try {
    const driverIdFromToken = req.body.driverId || req.driverId?.id;
    const { lat, lng, date } = req.body;

    // Validation
    if (!driverIdFromToken) {
      return res.status(401).json({ error: "Driver auth required (provide driverId)" });
    }
    if (!lat || !lng) {
      return res.status(400).json({ 
        error: "Driver current location {lat,lng} is required" 
      });
    }

    // Load driver
    const driver = await Driver.findById(driverIdFromToken).populate("vehicle");
    
    if (!driver || !driver.active) {
      return res.status(404).json({ error: "Driver not found or inactive" });
    }

    log(`🚗 Tour request from driver: ${driver.name} at (${lat}, ${lng})`);

    // Date boundaries
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
      log(`♻️  Returning existing tour ${existingTour._id}`);
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
      log(`🛑 Driver ${driver.name} reached max daily tours (${toursTodayCount})`);
      return res.status(200).json({
        reused: false,
        info: "Max daily tours reached for this driver",
        tour: null,
      });
    }

    // 3) FIX #7: Fetch eligible demands
    //    - Include expired demands (they have high priority)
    //    - Only demands with coordinates
    //    - Sort by priority (highest first) and deadline (closest first)
    const demands = await Demand.find({
      status: { $in: ["NEW", "CONFIRMED"] },
      "assigned.driverId": { $exists: false },
      "geo.lat": { $exists: true },
      "geo.lng": { $exists: true },
      // REMOVED: deadlineAt filter (we want expired demands!)
    })
      .sort({ priority: -1, deadlineAt: 1 })
      .limit(100) // Performance limit
      .lean();

    log(`📋 Found ${demands.length} eligible demands`);

    if (!demands.length) {
      return res.status(200).json({
        reused: false,
        info: "No eligible demands to build a tour",
        tour: null,
      });
    }

    // 4) Build tour with greedy algorithm
    const startPos = { lat: Number(lat), lng: Number(lng) };

    const { remainingCapacityKg, totalDistanceKm, selected } =
      buildGreedyTourForDriver({
        driver,
        demands,
        start: startPos,
        maxStops: driver.maxStopsPerTour || 8,
      });

    if (!selected.length) {
      log(`⚠️  No demands fit capacity from current position`);
      return res.status(200).json({
        reused: false,
        info: "No demands fit capacity from current position",
        tour: null,
      });
    }

    // 5) Build Tour document
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

    // 6) Mark demands as assigned
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

    log(`✅ Created tour ${tour._id} for driver ${driver.name} with ${selected.length} stops`);

    const populatedTour = await Tour.findById(tour._id).populate("stops.demand");

    res.status(201).json({
      reused: false,
      tour: populatedTour,
    });
  } catch (err) {
    log(`❌ Error in requestTour:`, err.message);
    next(err);
  }
}

/**
 * POST /tours/:tourId/start
 * Start a planned tour
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
        error: `Cannot start tour with status: ${tour.status}` 
      });
    }

    tour.status = "IN_PROGRESS";
    await tour.save();

    log(`🚀 Tour ${tourId} started`);

    res.json({ 
      success: true,
      tour 
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /tours/:tourId/stops/:stopId/complete
 * Body: { actualKg, notes? }
 */
async function completeStop(req, res, next) {
  try {
    const { tourId, stopId } = req.params;
    const { actualKg, notes } = req.body;

    if (actualKg == null) {
      return res.status(400).json({ error: "actualKg is required" });
    }

    const tour = await Tour.findById(tourId);
    if (!tour) return res.status(404).json({ error: "Tour not found" });

    const stop = tour.stops.id(stopId);
    if (!stop) return res.status(404).json({ error: "Stop not found" });

    stop.status = "COMPLETED";
    stop.actualKg = actualKg;
    stop.completedAt = new Date();
    if (notes) stop.notes = notes;

    // Mark demand as completed
    await Demand.findByIdAndUpdate(stop.demand, {
      $set: {
        status: "COMPLETED",
      },
    });

    // Check if all stops are done
    const allDone = tour.stops.every((s) =>
      ["COMPLETED", "NOT_READY", "PARTIAL"].includes(s.status)
    );
    
    if (allDone) {
      tour.status = "COMPLETED";
      log(`✅ Tour ${tourId} completed (all stops done)`);
    } else {
      tour.status = "IN_PROGRESS";
    }

    await tour.save();

    log(`✓ Stop ${stopId} completed: ${actualKg}kg collected`);

    res.json({ success: true, tour });
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

    // Release demand so it can be rescheduled
    await Demand.findByIdAndUpdate(stop.demand, {
      $set: {
        status: "NOT_READY",
      },
      $unset: {
        assigned: "",
      },
    });

    const allDone = tour.stops.every((s) =>
      ["COMPLETED", "NOT_READY", "PARTIAL"].includes(s.status)
    );
    tour.status = allDone ? "COMPLETED" : "IN_PROGRESS";

    await tour.save();

    log(`⚠️  Stop ${stopId} marked NOT_READY: ${reason || "no reason"}`);

    res.json({ success: true, tour });
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

    if (actualKg == null) {
      return res.status(400).json({ error: "actualKg is required" });
    }

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

    log(`⚠️  Stop ${stopId} partially completed: ${actualKg}kg`);

    res.json({ success: true, tour });
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
};