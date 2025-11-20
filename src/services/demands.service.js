// src/services/demands.service.js
const Demand = require("../models/Demand");
const { fetchAlbRecsRaw } = require("../integrations/signus.client");
const { log } = require("../utils/logger");
const SignusAlbRec = require("../models/signusAlbRec");

// estados we care about for planning (default)
const PLANNING_STATUSES = ["EN_CURSO", "ASIGNADA", "EN_TRANSITO"];

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeAlbRec(item) {
  const unidadesSolicitadas = (item.lineasRecogidaManual || []).reduce(
    (sum, line) => sum + (line.unidadesSolicitadas || 0),
    0
  );

  return {
    signusId: item.codigo,
    estadoCod: item.estadoCod,
    estado: item.estado,

    codigoPgnu: item.codigoPgnu,
    nombrePgnu: item.nombrePgnu,
    telefonoPgnu: (item.telefonoPgnu || "").trim(),

    latitud: item.latitud,
    longitud: item.longitud,
    direccion: (item.direccion || "").trim(),
    codigoPostal: item.codigoPostal,
    municipio: item.municipio,
    provincia: item.provincia,
    comunidad: item.comunidad,
    pais: item.pais,

    kgSolicitadosEstimados: item.kgSolicitadosEstimados,
    unidadesSolicitadas,

    fechaPeticion: parseDate(item.fechaPeticion),
    fechaMaxima: parseDate(item.fechaMaxima),
    fechaRealRecogida: parseDate(item.fechaRealRecogida),

    observacionesPeticion: item.observacionesPeticion,
    raw: item,
  };
}

async function upsertDemandsFromAlbRecs(albRecs) {
  if (!Array.isArray(albRecs)) {
    log("upsertDemandsFromAlbRecs called with non-array, aborting");
    return { created: 0, updated: 0, total: 0 };
  }

  log("Signus albRecs total received:", albRecs.length);

  let created = 0;
  let updated = 0;

  for (const item of albRecs) {
    const normalized = normalizeAlbRec(item);
    // console.log(normalizeAlbRec())

    const doc = await Demand.findOneAndUpdate(
      { signusId: normalized.signusId },
      { $set: normalized },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
    if (
      doc.createdAt &&
      doc.updatedAt &&
      doc.createdAt.getTime() === doc.updatedAt.getTime()
    ) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  const result = { created, updated, total: albRecs.length };
  log("Demands upsert result:", result);
  console.log(result);
  return result;
}

function dateMinus3Months() {
  const today = new Date();

  // clone date
  const target = new Date(today);

  // subtract 3 months
  target.setMonth(target.getMonth() - 3);

  // format YYYY-MM-DD
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * List demands from Mongo with filters.
 * Used for planning (LLM / OR-Tools input).
 *
 * opts:
 *   - estados: array of estadoCod values (default PLANNING_STATUSES)
 *   - from, to: ISO strings (filter by fechaPeticion)
 *   - page, limit
 *   - sortBy: 'fechaPeticion' | 'fechaMaxima' | 'kgSolicitadosEstimados'
 *   - sortDir: 'asc' | 'desc'
 */
async function listDemands(opts = {}) {
  const {
    estados,
    from,
    to,
    page = 1,
    limit = 50,
    sortBy = "fechaPeticion",
    sortDir = "desc",
  } = opts;

  const filter = {};

  // estados filter (estadoCod)
  const statusList = (
    estados && estados.length ? estados : PLANNING_STATUSES
  ).map((s) => s.toUpperCase());

  filter.estadoCod = { $in: statusList };

  // date range on fechaPeticion
  const fromDate = parseDate(from) || dateMinus3Months();
  const toDate = parseDate(to);

  if (fromDate || toDate) {
    filter.fechaPeticion = {};
    if (fromDate) filter.fechaPeticion.$gte = fromDate;
    if (toDate) filter.fechaPeticion.$lte = toDate;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sort = {
    [sortBy]: sortDir === "asc" ? 1 : -1,
  };
  const [items, total] = await Promise.all([
    Demand.find({ estadoCod: { $in: ["EN_CURSO", "ASIGNADA", "EN_TRANSITO"] } })
      .sort(sort)
      .skip(skip)
      .limit(Number(limit)),
    Demand.countDocuments(filter),
  ]);

  return {
    items,
    page: Number(page),
    limit: Number(limit),
    total,
  };
}

async function getPlanningDemands({ date }) {
  const raw = await fetchAlbRecsRaw();
  const items = raw.data || [];

  const planDate = date ? new Date(date) : new Date();

  // We only plan over "live" demands
  const planningEstados = new Set(["EN_CURSO", "ASIGNADA", "EN_TRANSITO"]);

  const demands = items
    .filter((row) => planningEstados.has(row.estadoCod))
    .map((row) => {
      const kg = row.kgSolicitadosEstimados || 0;

      const requestedAt = row.fechaPeticion
        ? new Date(row.fechaPeticion)
        : null;
      const deadlineAt = row.fechaMaxima ? new Date(row.fechaMaxima) : null;

      // age in days (how long since requested)
      let ageDays = 0;
      if (requestedAt) {
        ageDays = (planDate - requestedAt) / (1000 * 60 * 60 * 24);
        if (ageDays < 0) ageDays = 0;
      }

      // days left to deadline (how close to fechaMaxima)
      let daysToDeadline = 999;
      if (deadlineAt) {
        daysToDeadline = (deadlineAt - planDate) / (1000 * 60 * 60 * 24);
        if (daysToDeadline < 0) daysToDeadline = 0;
      }

      // Normalize scores (cap at 30 days so extremely old doesn’t dominate)
      const ageScore = Math.min(ageDays / 30, 1); // 0..1 (older => closer to 1)
      const deadlineScore = 1 - Math.min(daysToDeadline / 30, 1); // 0..1 (sooner => closer to 1)
      const weightScore = Math.min(kg / 3000, 1); // 0..1 (more kg => closer to 1)

      // Final priority 0–100 (tune weights as you like)
      const priority =
        (0.4 * ageScore + 0.4 * deadlineScore + 0.2 * weightScore) * 100;

      return {
        id: `albRec_${row.codigo}`,
        signusCodigo: row.codigo,
        garageId: row.codigoPgnu,
        garageName: row.nombrePgnu,
        kg,
        lat: row.latitud,
        lng: row.longitud,
        requestedAt,
        deadlineAt,
        ageDays: Number(ageDays.toFixed(1)),
        daysToDeadline: Number(daysToDeadline.toFixed(1)),
        priority: Math.round(priority),

        contactPhone: row.telefonoPgnu || null,
        address: {
          street: row.direccion || null,
          postalCode: row.codigoPostal || null,
          city: row.localidad || row.municipio || null,
          municipality: row.municipio || null,
          province: row.provincia || null,
          region: row.comunidad || null,
          country: row.pais || null,
        },
      };
    });

  // Sort by priority (highest first) as a base ordering
  demands.sort((a, b) => b.priority - a.priority);

  return demands;
}

module.exports = {
  normalizeAlbRec,
  listDemands,
  getPlanningDemands,
  upsertDemandsFromAlbRecs,
};
