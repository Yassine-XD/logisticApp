// src/services/demands.service.improved.js
// Replace your existing demands.service.js with this improved version

const Demand = require("../models/Demand");
const { fetchAlbRecsRaw } = require("../integrations/signus.client");
const { log } = require("../utils/logger");

// Estados we care about for planning (default)
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

/**
 * IMPROVED VERSION: Handles duplicates gracefully
 * Uses bulkWrite for better performance and error handling
 */
async function upsertDemandsFromAlbRecs(albRecs) {
  if (!Array.isArray(albRecs)) {
    log("upsertDemandsFromAlbRecs called with non-array, aborting");
    return { created: 0, updated: 0, errors: 0, total: 0 };
  }

  log("Signus albRecs total received:", albRecs.length);

  // STEP 1: Deduplicate input array by signusId
  const uniqueMap = new Map();
  albRecs.forEach((item) => {
    const signusId = item.codigo;
    if (signusId) {
      // Keep the last occurrence (most recent)
      uniqueMap.set(signusId, item);
    }
  });

  const uniqueAlbRecs = Array.from(uniqueMap.values());

  if (uniqueAlbRecs.length < albRecs.length) {
    log(
      `⚠️  Removed ${
        albRecs.length - uniqueAlbRecs.length
      } duplicate entries from input`
    );
  }

  log("Processing unique albRecs:", uniqueAlbRecs.length);

  // STEP 2: Prepare bulk operations
  const bulkOps = uniqueAlbRecs.map((item) => {
    const normalized = normalizeAlbRec(item);

    return {
      updateOne: {
        filter: { signusId: normalized.signusId },
        update: { $set: normalized },
        upsert: true,
      },
    };
  });

  if (bulkOps.length === 0) {
    log("No operations to perform");
    return { created: 0, updated: 0, errors: 0, total: 0 };
  }

  // STEP 3: Execute bulk operation with error handling
  let created = 0;
  let updated = 0;
  let errors = 0;

  try {
    const result = await Demand.bulkWrite(bulkOps, {
      ordered: false, // Continue even if some operations fail
    });

    created = result.upsertedCount || 0;
    updated = result.modifiedCount || 0;

    log("Bulk operation successful:", {
      created,
      updated,
      matched: result.matchedCount,
    });
  } catch (err) {
    // Handle bulk write errors
    if (err.code === 11000 || err.name === "BulkWriteError") {
      log("⚠️  Bulk write had some errors (likely duplicates):", err.message);

      // Extract successful operations from result
      if (err.result) {
        created = err.result.nUpserted || 0;
        updated = err.result.nModified || 0;
        errors = err.writeErrors?.length || 0;

        log("Partial success:", { created, updated, errors });
      }
    } else {
      // Unexpected error
      log("❌ Unexpected error in bulkWrite:", err);
      throw err;
    }
  }

  const result = {
    created,
    updated,
    errors,
    total: uniqueAlbRecs.length,
  };

  log("Demands upsert result:", result);
  return result;
}

/**
 * ALTERNATIVE: Individual upsert with better error handling
 * Use this if bulkWrite causes issues
 */
async function upsertDemandsFromAlbRecsIndividual(albRecs) {
  if (!Array.isArray(albRecs)) {
    log("upsertDemandsFromAlbRecs called with non-array, aborting");
    return { created: 0, updated: 0, errors: 0, total: 0 };
  }

  log("Signus albRecs total received:", albRecs.length);

  // Deduplicate input
  const uniqueMap = new Map();
  albRecs.forEach((item) => {
    if (item.codigo) {
      uniqueMap.set(item.codigo, item);
    }
  });

  const uniqueAlbRecs = Array.from(uniqueMap.values());
  log("Processing unique albRecs:", uniqueAlbRecs.length);

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const item of uniqueAlbRecs) {
    try {
      const normalized = normalizeAlbRec(item);

      // Get existing document to check if it's new
      const existing = await Demand.findOne({
        signusId: normalized.signusId,
      });

      const doc = await Demand.findOneAndUpdate(
        { signusId: normalized.signusId },
        { $set: normalized },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      if (!existing) {
        created += 1;
      } else {
        updated += 1;
      }
    } catch (err) {
      // Handle duplicate key error gracefully
      if (err.code === 11000) {
        log(`⚠️  Duplicate key for signusId ${item.codigo}, skipping...`);
        errors += 1;
      } else {
        log(`❌ Error upserting signusId ${item.codigo}:`, err.message);
        errors += 1;
      }
    }
  }

  const result = { created, updated, errors, total: uniqueAlbRecs.length };
  log("Demands upsert result:", result);
  return result;
}

function dateMinus3Months() {
  const today = new Date();
  const target = new Date(today);
  target.setMonth(target.getMonth() - 3);

  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * List demands from Mongo with filters.
 * Used for planning (LLM / OR-Tools input).
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

  // Estados filter (estadoCod)
  const statusList = (
    estados && estados.length ? estados : PLANNING_STATUSES
  ).map((s) => s.toUpperCase());

  filter.estadoCod = { $in: statusList };

  // Date range on fechaPeticion
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
    Demand.find(filter).sort(sort).skip(skip).limit(Number(limit)),
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

      // Age in days (how long since requested)
      let ageDays = 0;
      if (requestedAt) {
        ageDays = (planDate - requestedAt) / (1000 * 60 * 60 * 24);
        if (ageDays < 0) ageDays = 0;
      }

      // Days left to deadline (how close to fechaMaxima)
      let daysToDeadline = 999;
      if (deadlineAt) {
        daysToDeadline = (deadlineAt - planDate) / (1000 * 60 * 60 * 24);
        if (daysToDeadline < 0) daysToDeadline = 0;
      }

      // Normalize scores (cap at 30 days so extremely old doesn't dominate)
      const ageScore = Math.min(ageDays / 30, 1); // 0..1 (older => closer to 1)
      const deadlineScore = 1 - Math.min(daysToDeadline / 30, 1); // 0..1 (sooner => closer to 1)
      const weightScore = Math.min(kg / 3000, 1); // 0..1 (more kg => closer to 1)

      // Final priority 0–100 (tune weights as you like)
      const priority =
        (0.4 * ageScore + 0.4 * deadlineScore + 0.2 * weightScore) * 100;

      return {
        // === fields in new Demand model ===
        signusId: row.codigo,           // Number
        garageId: row.codigoPgnu,       // String
        garageName: row.nombrePgnu,     // String
        kg,

        geo: {
          lng: row.longitud ?? null,    // nullable Number to match schema
          lat: row.latitud ?? null,
        },

        requestedAt,
        deadlineAt,
        ageDays: Number(ageDays.toFixed(1)),
        daysToDeadline: Number(daysToDeadline.toFixed(1)),
        priority: Math.round(priority),

        contactPhone: row.telefonoPgnu || null,

        address: {
          street: (row.direccion && row.direccion.trim()) || null,
          postalCode: row.codigoPostal || null,
          city: row.localidad || row.municipio || null,
          municipality: row.municipio || null,
          province: row.provincia || null,
          region: row.comunidad || null,
          country: row.pais || null,
        },

        // keep full SIGNUS payload for debugging / audits
        raw: row,
      };
    });

  // Sort by priority (highest first) as a base ordering
  demands.sort((a, b) => b.priority - a.priority);

  console.log("[getPlanningDemands] first item from SIGNUS:", items[0]);
  console.log(
    "[getPlanningDemands] prepared",
    demands.length,
    "demands for insert"
  );

  // match the model: documents already shaped for DemandSchema
  const result = await Demand.insertMany(demands, { ordered: false });
  return result;
}

module.exports = {
  normalizeAlbRec,
  listDemands,
  getPlanningDemands,
  upsertDemandsFromAlbRecs,
  upsertDemandsFromAlbRecsIndividual, // Alternative method
};
