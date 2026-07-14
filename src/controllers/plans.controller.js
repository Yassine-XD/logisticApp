// src/controllers/plans.controller.js
const Plan = require("../models/Plan");
const optimizer = require("../services/optimizer.service");
const { log } = require("../utils/logger");

/** POST /plans/optimize { date, driverIds?, options?:{ algorithm } } */
async function optimize(req, res, next) {
  try {
    const { date, driverIds, options } = req.body || {};
    const algorithm = options?.algorithm === "greedy" ? "greedy" : "engine";
    const plan = await optimizer.createDraftPlan({
      date,
      driverIds,
      algorithm,
      userId: req.user?.userId,
    });
    res.status(201).json({ plan });
  } catch (err) {
    if (err.code === "ENGINE_UNREACHABLE") {
      return res.status(502).json({
        error: "El motor de optimización no está disponible.",
        code: "ENGINE_UNREACHABLE",
        fallbackAvailable: true,
      });
    }
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

/** GET /plans?date=&status= */
async function listPlans(req, res, next) {
  try {
    const { date, status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }
    const plans = await Plan.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ plans });
  } catch (err) {
    next(err);
  }
}

/** GET /plans/:id */
async function getPlan(req, res, next) {
  try {
    const plan = await Plan.findById(req.params.id).lean();
    if (!plan) return res.status(404).json({ error: "Plan no encontrado" });
    res.json({ plan });
  } catch (err) {
    next(err);
  }
}

/** PUT /plans/:id/routes { routes, unassigned } — save dispatcher edits */
async function saveRoutes(req, res, next) {
  try {
    const { routes, unassigned } = req.body || {};
    if (!Array.isArray(routes)) {
      return res.status(400).json({ error: "routes[] requerido" });
    }
    const plan = await optimizer.saveRoutes(req.params.id, routes, unassigned);
    res.json({ plan });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/** POST /plans/validate-edit — live validation proxy (engine or local) */
async function validateEdit(req, res, next) {
  try {
    const result = await optimizer.validateEdit(req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** POST /plans/:id/publish */
async function publish(req, res, next) {
  try {
    const { plan, tours } = await optimizer.publishPlan(req.params.id, req.user?.userId);
    res.json({ plan, tours, published: tours.length });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/** POST /plans/:id/discard */
async function discard(req, res, next) {
  try {
    const plan = await optimizer.discardPlan(req.params.id);
    res.json({ plan });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

module.exports = { optimize, listPlans, getPlan, saveRoutes, validateEdit, publish, discard };
