// src/services/readyDemands.service.js
const SignusAlbRec = require("../models/signusAlbRec");
const Demand = require("../models/Demand");
const { log } = require("../utils/logger");

/**
 * Refresh the SignusAlbRec collection from the big Demand collection.
 * - Upserts active/plannable demands into SignusAlbRec
 * - Optionally marks old records as inactive
 */
async function refreshReadyDemandsFromDemands() {
  const now = new Date();

  const candidates = await Demand.find({
    estadoCod: { $in: ["EN_CURSO", "ASIGNADA", "EN_TRANSITO"] },
  }).lean();

  log(`[ReadyDemands] Found ${candidates.length} candidate demands`);

  let created = 0;
  let updated = 0;

  // Upsert each candidate
  for (const d of candidates) {
    const doc = {
      demand: d._id,
      sourceRef: d.sourceRef,
      signusCodigo: d.signusCodigo, // if you store it on Demand
      garageId: d.codigoPgnu,
      garageName: d.nombrePgnu,
      geo: {
        lat: d.latitud,
        lng: d.longitud,
      },
      address: {
        street: d.direccion,
        postalCode: d.codigoPostal,
        city: d.municipio,
        province: d.provincia,
      },
      contactPhone: d.telefonoPgnu,
      qtyEstimatedKg: d.kgSolicitadosEstimados,
      tiresQty: d.unidadesSolicitadas,
      requestedAt: d.fechaPeticion,
      deadlineAt: d.fechaMaxima,
      status: d.status,
      isActive: true,
      lastSyncedAt: now,
    };

    const result = await SignusAlbRec.updateOne(
      { demand: d._id },
      { $set: doc },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      created++;
    } else if (result.modifiedCount > 0) {
      updated++;
    }
  }

  // Mark records no longer eligible as inactive (we don't delete big data)
  const inactiveResult = await SignusAlbRec.updateMany(
    {
      lastSyncedAt: { $lt: now }, // everything not touched in this run
      isActive: true,
    },
    { $set: { isActive: false } }
  );

  const inactivated = inactiveResult.modifiedCount || 0;

  const summary = {
    QuantityPreFilteredDemands: candidates.length,
    created,
    updated,
    inactivated,
  };

  log("[ReadyDemands] Sync summary:", summary);
  summary.PreFilteredDemands = candidates;
  return summary;
}



async function getPlanningDemands({ date }) {
  const target = new Date(date); // planning date
  if (isNaN(target.getTime())) {
    throw new Error("Invalid date passed to getPlanningDemands");
  }

  const rows = await SignusAlbRec.find().lean();
  console.log(rows)

  return rows.map((rec) => {
    const requestedAt = rec.fechaPeticion || null;
    const deadlineAt = rec.fechaMaxima || null;

    const now = Date.now();
    const ageDays = requestedAt
      ? (now - new Date(requestedAt).getTime()) / 86400000
      : 0;
    const daysToDeadline = deadlineAt
      ? (new Date(deadlineAt).getTime() - now) / 86400000
      : 365;

    // Choose a "kg" to plan with:
    // - Prefer kgSolicitadosEstimados
    // - Fallback to kgRecogidosEstimados
    const kg = rec.kgSolicitadosEstimados || rec.kgRecogidosEstimados || 0;

    return {
      id: rec.demand, // used as demandId in the planner
      kg,
      lat: rec.geo.lat,
      lng: rec.geo.lat,

      // You can later derive a smarter priority if you want
      priority: 0,

      requestedAt,
      deadlineAt,
      ageDays,
      daysToDeadline,

      signusCodigo: rec.codigo,
      garageId: rec.codigoPgnu,
      garageName: rec.nombrePgnu,
      contactPhone: rec.telefonoPgnu,
      address: {
        street: rec.direccion,
        postalCode: rec.codigoPostal,
        city: rec.localidad,
        province: rec.provincia,
        region: rec.comunidad,
        country: rec.pais,
      },
    };
  });
}

module.exports = {
  refreshReadyDemandsFromDemands,
  getPlanningDemands,
};
