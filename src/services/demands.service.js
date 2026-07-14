// src/services/demands.service.js
// Owns: SIGNUS→canonical normalization, sync (upsert), and planning reads.
// INVARIANT: planning READS from Mongo — it never writes. The cron sync is the
// only writer of SIGNUS-sourced fields.
const Demand = require("../models/Demand");
const Settings = require("../models/Settings");
const { fetchAlbRecsRaw } = require("../integrations/signus.client");
const { log } = require("../utils/logger");

const PLANNABLE_ESTADOS = Demand.PLANNABLE_ESTADOS;

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Map a raw SIGNUS albRec into our CANONICAL Demand shape.
 * Only SIGNUS-sourced fields — lifecycle `status`/`assigned` are owned by us
 * and set separately (setOnInsert / tour flow).
 */
function normalizeAlbRec(item) {
  const units = (item.lineasRecogidaManual || []).reduce(
    (sum, line) => sum + (line.unidadesSolicitadas || 0),
    0
  );
  const phone = (item.telefonoPgnu || "").trim() || null;

  return {
    signusId: item.codigo,
    signusAlbRec: item.albaran || (item.codigo != null ? `ALB${item.codigo}` : null),
    garageId: item.codigoPgnu,
    garageName: item.nombrePgnu,

    estadoCod: item.estadoCod,
    estado: item.estado,

    kg: item.kgSolicitadosEstimados || 0,
    unitsRequested: units,
    unidadesSolicitadas: units,

    geo: {
      lat: typeof item.latitud === "number" ? item.latitud : null,
      lng: typeof item.longitud === "number" ? item.longitud : null,
    },

    requestedAt: parseDate(item.fechaPeticion),
    deadlineAt: parseDate(item.fechaMaxima),
    collectedAt: parseDate(item.fechaRealRecogida),

    contactPhone: phone,
    contact: { phone },

    address: {
      street: (item.direccion || "").trim() || null,
      postalCode: item.codigoPostal || null,
      city: item.localidad || item.municipio || null,
      municipality: item.municipio || null,
      province: item.provincia || null,
      region: item.comunidad || null,
      country: item.pais || null,
    },

    raw: item,
  };
}

/**
 * Recompute derived metrics (ageDays, daysToDeadline, priority) relative to a
 * plan/reference date. Pure — returns a patch object.
 */
function computeMetrics(demand, refDate = new Date()) {
  const requestedAt = demand.requestedAt ? new Date(demand.requestedAt) : null;
  const deadlineAt = demand.deadlineAt ? new Date(demand.deadlineAt) : null;
  const DAY = 86400000;

  let ageDays = 0;
  if (requestedAt) ageDays = Math.max(0, (refDate - requestedAt) / DAY);

  let daysToDeadline = 999;
  if (deadlineAt) daysToDeadline = (deadlineAt - refDate) / DAY;

  const kg = demand.kg || 0;
  const ageScore = Math.min(ageDays / 30, 1);
  const deadlineScore = 1 - Math.min(Math.max(daysToDeadline, 0) / 30, 1);
  const weightScore = Math.min(kg / 3000, 1);
  const priority = Math.round(
    (0.4 * ageScore + 0.4 * deadlineScore + 0.2 * weightScore) * 100
  );

  return {
    ageDays: Number(ageDays.toFixed(1)),
    daysToDeadline: Number(daysToDeadline.toFixed(1)),
    priority,
  };
}

/**
 * SYNC: fetch from SIGNUS (mock|live), normalize, upsert into Mongo.
 * Preserves our lifecycle: `status` defaults to NEW only on insert, and we
 * never clobber an `assigned` demand's status back to NEW.
 */
async function syncDemands() {
  const raw = await fetchAlbRecsRaw();
  const items = Array.isArray(raw?.data) ? raw.data : [];
  log(`[sync] SIGNUS returned ${items.length} records`);

  // Dedup by codigo (keep last)
  const uniq = new Map();
  for (const it of items) if (it.codigo != null) uniq.set(it.codigo, it);

  const now = new Date();
  const ops = [];
  for (const it of uniq.values()) {
    const norm = normalizeAlbRec(it);
    const metrics = computeMetrics(norm, now);
    ops.push({
      updateOne: {
        filter: { signusId: norm.signusId },
        update: {
          $set: { ...norm, ...metrics },
          $setOnInsert: { status: "NEW" },
        },
        upsert: true,
      },
    });
  }

  if (!ops.length) return { created: 0, updated: 0, total: 0 };

  const res = await Demand.bulkWrite(ops, { ordered: false });
  const summary = {
    created: res.upsertedCount || 0,
    updated: res.modifiedCount || 0,
    matched: res.matchedCount || 0,
    total: uniq.size,
    syncedAt: now.toISOString(),
  };
  log("[sync] done:", summary);
  return summary;
}

/**
 * List demands from Mongo with filters (for the Demandas page).
 */
async function listDemands(opts = {}) {
  const {
    estados,
    status,
    province,
    urgentOnly,
    from,
    to,
    page = 1,
    limit = 500,
    sortBy = "deadlineAt",
    sortDir = "asc",
  } = opts;

  const filter = {};
  if (estados && estados.length) {
    filter.estadoCod = { $in: estados.map((s) => s.toUpperCase()) };
  }
  if (status) filter.status = status;
  if (province) filter["address.province"] = province;

  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (fromDate || toDate) {
    filter.deadlineAt = {};
    if (fromDate) filter.deadlineAt.$gte = fromDate;
    if (toDate) filter.deadlineAt.$lte = toDate;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sort = { [sortBy]: sortDir === "asc" ? 1 : -1 };

  let [items, total] = await Promise.all([
    Demand.find(filter).sort(sort).skip(skip).limit(Number(limit)).lean(),
    Demand.countDocuments(filter),
  ]);

  // Refresh derived metrics relative to now (cheap, keeps urgency accurate)
  const now = new Date();
  items = items.map((d) => ({ ...d, ...computeMetrics(d, now) }));

  const settings = await Settings.getSettings().catch(() => null);
  const threshold = settings?.urgencyThresholdDays ?? 2;
  if (urgentOnly) items = items.filter((d) => d.daysToDeadline <= threshold);

  return { items, page: Number(page), limit: Number(limit), total, urgencyThresholdDays: threshold };
}

/**
 * PLANNING READ: plannable demands from Mongo, metrics recomputed vs planDate.
 * Never writes. Returns lean docs enriched with ageDays/daysToDeadline/priority.
 */
async function getPlanningDemands({ planDate, driverExclude = true } = {}) {
  const ref = planDate ? new Date(planDate) : new Date();

  const filter = {
    estadoCod: { $in: PLANNABLE_ESTADOS },
    status: { $in: ["NEW", "NOT_READY"] }, // not currently on a live tour
    "geo.lat": { $ne: null },
    "geo.lng": { $ne: null },
    kg: { $gt: 0 },
  };
  if (driverExclude) filter["assigned.tourId"] = { $exists: false };

  const rows = await Demand.find(filter).lean();
  return rows
    .map((d) => ({ ...d, ...computeMetrics(d, ref) }))
    .sort((a, b) => b.priority - a.priority);
}

module.exports = {
  normalizeAlbRec,
  computeMetrics,
  syncDemands,
  listDemands,
  getPlanningDemands,
  PLANNABLE_ESTADOS,
};
