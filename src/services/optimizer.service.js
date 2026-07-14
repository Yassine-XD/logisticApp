// src/services/optimizer.service.js
// THE product's brain: assembles an OptimizationRequest from Mongo, calls the
// Python OR-Tools engine (server-to-server, API-key auth), persists the result
// as a DRAFT Plan, and publishes plans into executable Tours.
// Falls back to the in-process greedy planner when the engine is unreachable.
const axios = require("axios");
const mongoose = require("mongoose");
const config = require("../config");
const Demand = require("../models/Demand");
const Driver = require("../models/Driver");
const Plan = require("../models/Plan");
const Tour = require("../models/Tour");
const Settings = require("../models/Settings");
const { getPlanningDemands } = require("./demands.service");
const { planGreedy } = require("./greedy.service");
const { log } = require("../utils/logger");

class EngineUnreachableError extends Error {
  constructor(message) {
    super(message);
    this.name = "EngineUnreachableError";
    this.code = "ENGINE_UNREACHABLE";
  }
}

const s = (v) => (v == null ? "" : String(v));

// ── Request assembly ─────────────────────────────────────────────────────
function garageForEngine(d) {
  return {
    signusId: d.signusId,
    garageId: s(d.garageId),
    garageName: s(d.garageName) || s(d.garageId),
    kg: Math.round(d.kg || 0),
    geo: { lat: d.geo.lat, lng: d.geo.lng },
    requestedAt: (d.requestedAt ? new Date(d.requestedAt) : new Date()).toISOString(),
    deadlineAt: (d.deadlineAt ? new Date(d.deadlineAt) : new Date(Date.now() + 14 * 864e5)).toISOString(),
    ageDays: d.ageDays ?? 0,
    daysToDeadline: d.daysToDeadline ?? 14,
    priority: Math.round(d.priority ?? 0),
    contactPhone: s(d.contactPhone || d.contact?.phone),
    address: {
      street: s(d.address?.street),
      postalCode: s(d.address?.postalCode),
      city: s(d.address?.city),
      municipality: s(d.address?.municipality),
      province: s(d.address?.province),
      region: s(d.address?.region),
      country: s(d.address?.country) || "España",
    },
  };
}

function assembleRequest({ demands, drivers, settings, planDate }) {
  const depot = { lat: settings.depot.lat, lng: settings.depot.lng };
  const vehicles = [];
  const engineDrivers = [];

  for (const driver of drivers) {
    const v = driver.vehicle;
    if (!v || !v.capacityKg) continue;
    vehicles.push({
      vehicleId: String(v._id),
      driverName: driver.name,
      capacityKg: v.capacityKg,
      startLocation: depot,
      licensePlate: v.plate,
      maxStops: 15,
    });
    engineDrivers.push({
      driverId: String(driver._id),
      driverName: driver.name,
      vehicleId: String(v._id),
      status: "available",
      maxTours: driver.maxDailyTours || settings.maxToursPerDriver,
    });
  }

  return {
    garages: demands.map(garageForEngine),
    vehicles,
    drivers: engineDrivers,
    warehouseLocation: depot,
    minCapacityUtilization: (settings.capacityTargetPct ?? 80) / 100,
    maxCapacityUtilization: 1.0,
    // Extensions consumed by the patched engine:
    planDate: new Date(planDate).toISOString(),
    urgencyThresholdDays: settings.urgencyThresholdDays ?? 2,
    driverTimeBudgetHours: settings.workdayLengthHours ?? 9,
    workdayStartHour: settings.workdayStartHour ?? 8,
  };
}

// ── Engine call + normalization ──────────────────────────────────────────
async function callEngine(path, body) {
  try {
    const res = await axios.post(`${config.ENGINE_URL}${path}`, body, {
      timeout: config.ENGINE_TIMEOUT_MS,
      headers: config.ENGINE_API_KEY ? { "X-API-Key": config.ENGINE_API_KEY } : {},
    });
    return res.data;
  } catch (err) {
    const netCodes = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"];
    if (netCodes.includes(err.code) || err.message?.includes("timeout")) {
      throw new EngineUnreachableError(`Engine unreachable at ${config.ENGINE_URL}: ${err.message}`);
    }
    if (err.response) {
      const detail = err.response.data?.detail || err.response.statusText;
      const e = new Error(`Engine error ${err.response.status}: ${detail}`);
      e.code = "ENGINE_ERROR";
      throw e;
    }
    throw err;
  }
}

function normalizeEngineResponse(resp, demandsBySignus, drivers) {
  // Map engine vehicleId (our vehicle _id string) → driver/vehicle
  const byVehicle = new Map();
  for (const d of drivers) {
    if (d.vehicle) byVehicle.set(String(d.vehicle._id), d);
  }
  const byName = new Map(drivers.map((d) => [d.name, d]));

  const mapStop = (st, seq) => {
    const demand = demandsBySignus.get(st.signusId);
    return {
      demand: demand?._id,
      signusId: st.signusId,
      signusAlbRec: demand?.signusAlbRec,
      garageId: st.garageId,
      garageName: st.garageName,
      sequence: st.sequence ?? seq,
      plannedKg: st.kg,
      geo: { lat: st.geo?.lat, lng: st.geo?.lng },
      address: demand?.address || st.address,
      contactPhone: st.contactPhone || demand?.contactPhone,
      deadlineAt: demand?.deadlineAt || st.deadlineAt,
      requestedAt: demand?.requestedAt || st.requestedAt,
      daysToDeadline: st.daysToDeadline,
      priority: st.priority,
      isUrgent: st.isUrgent,
      distanceFromPrevious: st.distanceFromPrevious,
    };
  };

  const routes = (resp.routes || [])
    .map((r) => {
      const driver = byVehicle.get(String(r.vehicleId)) || byName.get(r.driverName);
      const stops = (r.stops || []).map(mapStop).filter((x) => x.demand);
      if (!stops.length) return null;
      return {
        routeId: r.routeId,
        driver: driver?._id,
        driverName: r.driverName || driver?.name,
        vehicle: driver?.vehicle?._id,
        vehicleId: r.vehicleId,
        vehiclePlate: driver?.vehicle?.plate,
        tourIndex: 0,
        capacityKg: driver?.vehicle?.capacityKg || 0,
        totalKg: r.totalKg,
        totalDistanceKm: r.totalDistance,
        estimatedDurationHours: r.estimatedDuration,
        capacityUtilizationPercent: r.capacityUtilizationPercent,
        urgentCount: r.urgentCount || 0,
        stops,
      };
    })
    .filter(Boolean);

  // Assign per-driver tourIndex (order of that driver's routes)
  const perDriver = new Map();
  for (const r of routes) {
    const k = String(r.driver);
    const idx = perDriver.get(k) ?? 0;
    r.tourIndex = idx;
    perDriver.set(k, idx + 1);
  }

  const unassigned = (resp.unassignedGarages || []).map((g) => {
    const demand = demandsBySignus.get(g.signusId);
    return {
      demand: demand?._id,
      signusId: g.signusId,
      signusAlbRec: demand?.signusAlbRec,
      garageId: g.garageId,
      garageName: g.garageName,
      plannedKg: g.kg,
      geo: { lat: g.geo?.lat, lng: g.geo?.lng },
      address: demand?.address,
      contactPhone: g.contactPhone,
      deadlineAt: g.deadlineAt,
      daysToDeadline: g.daysToDeadline,
      priority: g.priority,
      isUrgent: (g.daysToDeadline ?? 14) <= 2,
    };
  });

  return {
    algorithm: "engine",
    optimizationId: resp.optimizationId,
    summary: resp.summary || {},
    routes,
    unassigned,
  };
}

// ── Public API ───────────────────────────────────────────────────────────
async function loadPlanningInputs({ driverIds, planDate }) {
  const settings = await Settings.getSettings({ fresh: true });
  const demands = await getPlanningDemands({ planDate });
  const demandsBySignus = new Map(demands.map((d) => [d.signusId, d]));

  const driverFilter = { active: true };
  if (driverIds && driverIds.length) {
    driverFilter._id = { $in: driverIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }
  const drivers = (await Driver.find(driverFilter).populate("vehicle").lean()).filter(
    (d) => d.vehicle && d.vehicle.active !== false && d.vehicle.capacityKg
  );

  return { settings, demands, demandsBySignus, drivers };
}

/**
 * Create a DRAFT plan for a date. algorithm: "engine" (default) | "greedy".
 * Throws EngineUnreachableError when engine algorithm requested but unreachable.
 */
async function createDraftPlan({ date, driverIds, algorithm = "engine", userId }) {
  const planDate = date ? new Date(date) : new Date();
  const { settings, demands, demandsBySignus, drivers } = await loadPlanningInputs({
    driverIds,
    planDate,
  });

  if (!drivers.length) {
    const e = new Error("No hay conductores activos con vehículo asignado.");
    e.status = 400;
    e.code = "NO_DRIVERS";
    throw e;
  }
  if (!demands.length) {
    const e = new Error("No hay demandas planificables (sincroniza SIGNUS primero).");
    e.status = 400;
    e.code = "NO_DEMANDS";
    throw e;
  }

  let draft;
  if (algorithm === "greedy") {
    draft = planGreedy({
      demands,
      drivers,
      depot: { lat: settings.depot.lat, lng: settings.depot.lng },
      settings,
    });
  } else {
    const request = assembleRequest({ demands, drivers, settings, planDate });
    const resp = await callEngine("/api/v1/optimize", request);
    draft = normalizeEngineResponse(resp, demandsBySignus, drivers);
  }

  const plan = await Plan.create({
    date: planDate,
    status: "DRAFT",
    algorithm: draft.algorithm,
    optimizationId: draft.optimizationId,
    summary: draft.summary,
    routes: draft.routes,
    unassigned: draft.unassigned,
    createdBy: userId,
  });

  log(
    `[plan] draft ${plan._id} (${draft.algorithm}): ${draft.routes.length} routes, ` +
      `${draft.unassigned.length} unassigned`
  );
  return plan;
}

async function replicaSetAvailable() {
  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.command({ hello: 1 });
    return Boolean(info.setName);
  } catch (_) {
    return false;
  }
}

function planStopToTourStop(st, order) {
  return {
    demand: st.demand,
    signusId: st.signusId,
    signusAlbRec: st.signusAlbRec,
    order,
    status: "SCHEDULED",
    plannedKg: st.plannedKg,
    garageName: st.garageName,
    garageId: st.garageId,
    geo: { lat: st.geo?.lat, lng: st.geo?.lng },
    address: st.address,
    contact: { phone: st.contactPhone },
    distanceFromPrevKm: st.distanceFromPrevious,
    requestedAt: st.requestedAt,
    deadlineAt: st.deadlineAt,
    priority: st.priority,
  };
}

/**
 * Publish a DRAFT plan → creates Tour docs and marks demands SCHEDULED.
 * Uses a transaction when a replica set is available; otherwise best-effort
 * sequential writes with cleanup on failure.
 */
async function publishPlan(planId, userId) {
  const plan = await Plan.findById(planId);
  if (!plan) {
    const e = new Error("Plan no encontrado");
    e.status = 404;
    throw e;
  }
  if (plan.status !== "DRAFT") {
    const e = new Error(`El plan ya está ${plan.status}`);
    e.status = 409;
    throw e;
  }

  const useTx = await replicaSetAvailable();
  const session = useTx ? await mongoose.startSession() : null;
  const createdTourIds = [];

  const doWork = async () => {
    for (const route of plan.routes) {
      if (!route.stops.length) continue;
      const stops = route.stops.map((st, i) => planStopToTourStop(st, i + 1));
      const [tour] = await Tour.create(
        [
          {
            driver: route.driver,
            vehicle: route.vehicle,
            plan: plan._id,
            tourIndex: route.tourIndex || 0,
            date: plan.date,
            status: "PLANNED",
            capacityKg: route.capacityKg,
            totalDistanceKm: route.totalDistanceKm,
            remainingCapacityKg: route.capacityKg - route.totalKg,
            stops,
          },
        ],
        session ? { session } : {}
      );
      createdTourIds.push(tour._id);

      const demandIds = route.stops.map((st) => st.demand).filter(Boolean);
      await Demand.updateMany(
        { _id: { $in: demandIds } },
        {
          $set: {
            status: "SCHEDULED",
            "assigned.driverId": route.driver,
            "assigned.tourId": tour._id,
            "assigned.planId": plan._id,
            "assigned.date": plan.date,
          },
        },
        session ? { session } : {}
      );
    }
    plan.status = "PUBLISHED";
    plan.publishedAt = new Date();
    await plan.save(session ? { session } : {});
  };

  try {
    if (session) {
      await session.withTransaction(doWork);
      session.endSession();
    } else {
      await doWork();
    }
  } catch (err) {
    if (session) session.endSession();
    if (!useTx && createdTourIds.length) {
      // Best-effort cleanup so a partial publish doesn't leave orphans
      await Tour.deleteMany({ _id: { $in: createdTourIds } }).catch(() => {});
      await Demand.updateMany(
        { "assigned.planId": plan._id },
        { $set: { status: "NEW" }, $unset: { assigned: "" } }
      ).catch(() => {});
    }
    throw err;
  }

  const tours = await Tour.find({ plan: plan._id }).lean();
  log(`[plan] published ${plan._id}: ${tours.length} tours (tx=${useTx})`);
  return { plan, tours };
}

async function discardPlan(planId) {
  const plan = await Plan.findById(planId);
  if (!plan) {
    const e = new Error("Plan no encontrado");
    e.status = 404;
    throw e;
  }
  if (plan.status === "PUBLISHED") {
    const e = new Error("No se puede descartar un plan publicado");
    e.status = 409;
    throw e;
  }
  plan.status = "DISCARDED";
  await plan.save();
  return plan;
}

/**
 * Save dispatcher's drag-and-drop edits onto a DRAFT plan, after validating
 * capacity via the engine's validate-edit (proxied). Recomputes route totals.
 */
async function saveRoutes(planId, routes, unassigned) {
  const plan = await Plan.findById(planId);
  if (!plan) {
    const e = new Error("Plan no encontrado");
    e.status = 404;
    throw e;
  }
  if (plan.status !== "DRAFT") {
    const e = new Error("Solo se pueden editar planes en borrador");
    e.status = 409;
    throw e;
  }
  // Recompute totals from provided stops
  for (const r of routes) {
    r.totalKg = (r.stops || []).reduce((sum, st) => sum + (st.plannedKg || 0), 0);
    r.capacityUtilizationPercent = r.capacityKg
      ? Number(((r.totalKg / r.capacityKg) * 100).toFixed(1))
      : 0;
    r.urgentCount = (r.stops || []).filter((st) => st.isUrgent).length;
    (r.stops || []).forEach((st, i) => (st.sequence = i + 1));
  }
  plan.routes = routes;
  if (unassigned) plan.unassigned = unassigned;
  await plan.save();
  return plan;
}

async function validateEdit(body) {
  // Proxy to engine; if unreachable, do a local capacity check.
  try {
    return await callEngine("/api/v1/validate-edit", body);
  } catch (err) {
    if (err.code !== "ENGINE_UNREACHABLE") throw err;
    log.warn("[plan] validate-edit fallback (engine down): local capacity check");
    const routes = (body.routes || []).map((r) => {
      const totalKg = (r.stops || []).reduce((s, x) => s + (x.kg || 0), 0);
      const over = totalKg > r.capacityKg;
      return {
        routeId: r.routeId,
        driverName: r.driverName,
        totalKg,
        capacityKg: r.capacityKg,
        utilizationPercent: r.capacityKg ? Number(((totalKg / r.capacityKg) * 100).toFixed(1)) : 0,
        overCapacity: over,
        stopCount: (r.stops || []).length,
        estimatedDistanceKm: 0,
        warnings: over ? [`Sobrecarga de ${totalKg - r.capacityKg} kg`] : [],
      };
    });
    return {
      valid: routes.every((r) => !r.overCapacity),
      routes,
      globalWarnings: [],
      unassignedCount: (body.unassignedStops || []).length,
    };
  }
}

module.exports = {
  EngineUnreachableError,
  createDraftPlan,
  publishPlan,
  discardPlan,
  saveRoutes,
  validateEdit,
  assembleRequest, // exported for tests
  normalizeEngineResponse, // exported for tests
};
