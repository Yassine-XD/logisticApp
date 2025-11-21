// src/controllers/demands.controller.js
const {
  listDemands,
  getPlanningDemands,
} = require("../services/demands.service");
const {
  refreshReadyDemandsFromDemands,
} = require("../services/ready.demands.service");
const { log } = require("../utils/logger");

/**
 * GET /demands
 * Query params:
 *   - estadoCod: "EN_CURSO,ASIGNADA,EN_TRANSITO"
 *   - from: "2025-11-01"
 *   - to: "2025-11-11"
 *   - page: number
 *   - limit: number
 *   - sortBy: "fechaPeticion" | "fechaMaxima" | "kgSolicitadosEstimados"
 *   - sortDir: "asc" | "desc"
 */
async function getDemands(req, res, next) {
  try {
    const { estadoCod, from, to, page, limit, sortBy, sortDir } = req.query;

    let estados = undefined;
    if (estadoCod) {
      estados = estadoCod
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const result = await listDemands({
      estados,
      from,
      to,
      page,
      limit,
      sortBy,
      sortDir,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function fetchDataFromSignus(req, res, next) {
  try {
    const result = await getPlanningDemands();
    

    res.json({
      Total: result.length,
      data: result,
    });
  } catch (error) {
    res.json({
      err,
    });
  }
}

async function refreshPreDemands(req, res, next) {
  try {
    const candidtas = await refreshReadyDemandsFromDemands();
    res.json(candidtas);
  } catch (error) {
    res.json({
      status: "Failed",
      message: error.message,
    });
    next();
  }
}

module.exports = {
  refreshPreDemands,
  getDemands,
  fetchDataFromSignus
};
