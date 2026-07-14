// src/controllers/demands.controller.js
const { listDemands } = require("../services/demands.service");
const { runSync, getLastRun } = require("../jobs/sync.job");
const { log } = require("../utils/logger");

/**
 * GET /demands — list synced demands with filters.
 * Query: estadoCod, status, province, urgentOnly, from, to, page, limit, sortBy, sortDir
 */
async function getDemands(req, res, next) {
  try {
    const {
      estadoCod,
      status,
      province,
      urgentOnly,
      from,
      to,
      page,
      limit,
      sortBy,
      sortDir,
    } = req.query;

    const estados = estadoCod
      ? estadoCod.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const result = await listDemands({
      estados,
      status,
      province,
      urgentOnly: urgentOnly === "true",
      from,
      to,
      page,
      limit,
      sortBy,
      sortDir,
    });

    res.json({ ...result, lastSync: getLastRun() });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /demands/sync — trigger an on-demand SIGNUS sync (admin/dispatcher).
 */
async function syncNow(req, res) {
  try {
    const summary = await runSync("manual");
    res.json({ success: true, summary });
  } catch (err) {
    log.error("Manual sync failed:", err.message);
    res.status(502).json({ success: false, error: err.message });
  }
}

/**
 * GET /demands/sync-status — last sync result.
 */
async function syncStatus(req, res) {
  res.json({ lastSync: getLastRun() });
}

module.exports = { getDemands, syncNow, syncStatus };
