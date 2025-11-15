// src/jobs/syncSignusDemands.job.js
const { fetchAlbRecsRaw } = require("../integrations/signus.client");
const { upsertDemandsFromAlbRecs } = require("../services/demands.service");
const { log } = require("../utils/logger");

async function runDemandsSync() {
  try {
    log("Starting Signus demands sync...");

    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - 10); // last 10 days; tweak as you like

    const albRecs = await fetchAlbRecsRaw();

    const result = await upsertDemandsFromAlbRecs(albRecs.data);
    log("Signus demands sync finished:", result);
  } catch (err) {
    log("Signus demands sync failed:", err.message);
  }
}

function startDemandsSyncLoop() {
  runDemandsSync();
  setInterval(runDemandsSync, 1000 * 60 * 60); // every hour
}

module.exports = {
  runDemandsSync,
  startDemandsSyncLoop,
};
