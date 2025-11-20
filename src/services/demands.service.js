// src/services/demands.service.js - FINAL VERSION WITH CORRECT FIELD MAPPING
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

/**
 * FIX: Correct field mapping based on actual SIGNUS API response
 * 
 * SIGNUS Fields → Our DB Fields:
 * - codigoPgnu → garageId
 * - nombrePgnu → garageName  
 * - kgSolicitadosEstimados → qtyEstimatedKg
 * - unidadesSolicitadas → unitsEstimated
 * - municipio → address.city (NO localidad field exists)
 * - direccion → address.street
 * - latitud/longitud → geo.lat/lng
 */
function normalizeAlbRec(item) {
  // Calculate units from lineasRecogidaManual if available
  const unidadesSolicitadas = item.unidadesSolicitadas || 
    (item.lineasRecogidaManual || []).reduce(
      (sum, line) => sum + (line.unidadesSolicitadas || 0),
      0
    );

  const kg = item.kgSolicitadosEstimados || 0;
  const planDate = new Date();
  const requestedAt = parseDate(item.fechaPeticion);
  const deadlineAt = parseDate(item.fechaMaxima);

  // Calculate priority
  let ageDays = 0;
  if (requestedAt) {
    ageDays = (planDate - requestedAt) / (1000 * 60 * 60 * 24);
    if (ageDays < 0) ageDays = 0;
  }

  let daysToDeadline = 999;
  if (deadlineAt) {
    daysToDeadline = (deadlineAt - planDate) / (1000 * 60 * 60 * 24);
    if (daysToDeadline < 0) daysToDeadline = 0;
  }

  // Normalize scores (cap at 30 days)
  const ageScore = Math.min(ageDays / 30, 1);
  const deadlineScore = 1 - Math.min(daysToDeadline / 30, 1);
  const weightScore = Math.min(kg / 3000, 1);

  // Final priority 0–100
  const priority = (0.4 * ageScore + 0.4 * deadlineScore + 0.2 * weightScore) * 100;

  return {
    // Identifiers
    signusId: item.codigo,
    estadoCod: item.estadoCod,
    estado: item.estado,

    // Garage info
    garageId: item.codigoPgnu,
    garageName: item.nombrePgnu,

    // Location - CORRECT MAPPING
    geo: {
      lat: item.latitud,
      lng: item.longitud,
    },

    // Address - FIX: municipio is the city, NO localidad field
    address: {
      street: (item.direccion || "").trim(),
      postalCode: item.codigoPostal,
      city: item.municipio, // ← FIX: Just use municipio, no fallback needed
      municipality: item.municipio,
      province: item.provincia,
      region: item.comunidad,
      country: item.pais,
    },

    // Contact
    contact: {
      phone: (item.telefonoPgnu || "").trim(),
    },

    // Quantities - CORRECT FIELD NAMES
    qtyEstimatedKg: kg,
    unitsEstimated: unidadesSolicitadas,

    // Dates
    requestedAt,
    deadlineAt,
    
    // Add actual collection date if exists
    actualCollectionAt: parseDate(item.fechaRealRecogida),

    // Priority calculated at sync time
    priority: Math.round(priority),

    // Notes
    notes: item.observacionesPeticion,

    // IMPORTANT: Save complete raw data for future reference
    raw: item,
  };
}

/**
 * Upsert demands with improved error handling
 */
async function upsertDemandsFromAlbRecs(albRecs) {
  if (!Array.isArray(albRecs)) {
    log("⚠️  upsertDemandsFromAlbRecs called with non-array, aborting");
    return { created: 0, updated: 0, total: 0, errors: 0, skipped: 0 };
  }

  log(`📥 Signus albRecs total received: ${albRecs.length}`);

  let created = 0;
  let updated = 0;
  let errors = 0;
  let skipped = 0;

  for (const item of albRecs) {
    try {
      // Validate required fields
      if (!item.codigo) {
        log(`⚠️  Skipping item - missing codigo`);
        skipped++;
        continue;
      }

      const normalized = normalizeAlbRec(item);

      // Skip demands without coordinates
      if (!normalized.geo.lat || !normalized.geo.lng) {
        log(`⚠️  Skipping demand ${normalized.signusId} - missing coordinates`);
        skipped++;
        continue;
      }

      // Skip if no weight (can't plan route)
      if (!normalized.qtyEstimatedKg || normalized.qtyEstimatedKg <= 0) {
        log(`⚠️  Skipping demand ${normalized.signusId} - no weight specified`);
        skipped++;
        continue;
      }

      const doc = await Demand.findOneAndUpdate(
        { signusId: normalized.signusId },
        { $set: normalized },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      // Determine if this was a create or update
      if (
        doc.createdAt &&
        doc.updatedAt &&
        Math.abs(doc.createdAt.getTime() - doc.updatedAt.getTime()) < 1000 // within 1 second
      ) {
        created += 1;
      } else {
        updated += 1;
      }
    } catch (err) {
      log(`❌ Error upserting demand ${item.codigo}:`, err.message);
      errors++;
    }
  }

  const result = { created, updated, total: albRecs.length, errors, skipped };
  log("✅ Demands upsert result:", result);
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
 * List demands from MongoDB with filters
 */
async function listDemands(opts = {}) {
  const {
    estados,
    from,
    to,
    page = 1,
    limit = 50,
    sortBy = "requestedAt",
    sortDir = "desc",
  } = opts;

  const filter = {};

  // Estados filter (estadoCod)
  const statusList = (
    estados && estados.length ? estados : PLANNING_STATUSES
  ).map((s) => s.toUpperCase());

  filter.estadoCod = { $in: statusList };

  // Date range on requestedAt
  const fromDate = from ? parseDate(from) : null;
  const toDate = to ? parseDate(to) : null;

  if (fromDate || toDate) {
    filter.requestedAt = {};
    if (fromDate) filter.requestedAt.$gte = fromDate;
    if (toDate) filter.requestedAt.$lte = toDate;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sort = {
    [sortBy]: sortDir === "asc" ? 1 : -1,
  };

  // Use the filter we built
  const [items, total] = await Promise.all([
    Demand.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Demand.countDocuments(filter),
  ]);

  return {
    items,
    page: Number(page),
    limit: Number(limit),
    total,
  };
}

/**
 * Get planning demands for greedy algorithm
 * Now simplified since priority is stored in DB
 */
async function getPlanningDemands({ date } = {}) {
  try {
    const raw = await fetchAlbRecsRaw();
    
    if (!raw || !raw.data) {
      log("⚠️  No data returned from Signus API");
      return [];
    }

    const items = raw.data || [];
    const planDate = date ? new Date(date) : new Date();

    // Only plan over "live" demands
    const planningEstados = new Set(["EN_CURSO", "ASIGNADA", "EN_TRANSITO"]);

    const demands = items
      .filter((row) => {
        // Must have planning status
        if (!planningEstados.has(row.estadoCod)) return false;
        
        // Must have coordinates
        if (!row.latitud || !row.longitud) return false;
        
        // Must have weight
        if (!row.kgSolicitadosEstimados || row.kgSolicitadosEstimados <= 0) return false;
        
        return true;
      })
      .map((row) => {
        const kg = row.kgSolicitadosEstimados || 0;
        const requestedAt = row.fechaPeticion ? new Date(row.fechaPeticion) : null;
        const deadlineAt = row.fechaMaxima ? new Date(row.fechaMaxima) : null;

        // Calculate age and deadline metrics for display
        let ageDays = 0;
        if (requestedAt) {
          ageDays = (planDate - requestedAt) / (1000 * 60 * 60 * 24);
          if (ageDays < 0) ageDays = 0;
        }

        let daysToDeadline = 999;
        if (deadlineAt) {
          daysToDeadline = (deadlineAt - planDate) / (1000 * 60 * 60 * 24);
          if (daysToDeadline < 0) daysToDeadline = 0;
        }

        // Calculate priority
        const ageScore = Math.min(ageDays / 30, 1);
        const deadlineScore = 1 - Math.min(daysToDeadline / 30, 1);
        const weightScore = Math.min(kg / 3000, 1);
        const priority = (0.4 * ageScore + 0.4 * deadlineScore + 0.2 * weightScore) * 100;

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
            city: row.municipio || null, // ← FIX: No localidad
            municipality: row.municipio || null,
            province: row.provincia || null,
            region: row.comunidad || null,
            country: row.pais || null,
          },
        };
      });

    // Sort by priority (highest first)
    demands.sort((a, b) => b.priority - a.priority);

    log(`✅ Planning demands prepared: ${demands.length} items`);
    return demands;
  } catch (err) {
    log(`❌ Error in getPlanningDemands:`, err.message);
    return [];
  }
}

module.exports = {
  normalizeAlbRec,
  listDemands,
  getPlanningDemands,
  upsertDemandsFromAlbRecs,
};