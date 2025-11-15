// src/controllers/demands.controller.js
const { listDemands } = require("../services/demands.service");


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
    const {
      estadoCod,
      from,
      to,
      page,
      limit,
      sortBy,
      sortDir,
    } = req.query;

    let estados = undefined;
    if (estadoCod) {
      estados = estadoCod.split(",").map((s) => s.trim()).filter(Boolean);
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

module.exports = {
  getDemands,
};
