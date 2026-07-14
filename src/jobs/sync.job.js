// src/jobs/sync.job.js
// ONE node-cron schedule that runs the SIGNUS demands sync directly.
// Replaces the previous runaway setInterval-inside-a-cron pattern that
// registered a new interval every hour.
const cron = require("node-cron");
const config = require("../config");
const { syncDemands } = require("../services/demands.service");
const { log } = require("../utils/logger");

let _task = null;
let _lastRun = null;

async function runSync(reason = "cron") {
  try {
    log(`[sync] start (${reason})`);
    const summary = await syncDemands();
    _lastRun = { at: new Date().toISOString(), ok: true, summary };
    return summary;
  } catch (err) {
    log.error("[sync] FAILED:", err.message);
    _lastRun = { at: new Date().toISOString(), ok: false, error: err.message };
    throw err;
  }
}

function startSyncJob() {
  if (_task) return _task;
  // Single schedule; the callback awaits one sync run. No nested intervals.
  _task = cron.schedule(config.SYNC_CRON, () => {
    runSync("cron").catch(() => {});
  });
  log(`[sync] scheduled: "${config.SYNC_CRON}"`);

  if (config.SYNC_ON_BOOT) {
    // Fire once shortly after boot so a fresh DB has data.
    setTimeout(() => runSync("boot").catch(() => {}), 1500);
  }
  return _task;
}

function getLastRun() {
  return _lastRun;
}

module.exports = { startSyncJob, runSync, getLastRun };
