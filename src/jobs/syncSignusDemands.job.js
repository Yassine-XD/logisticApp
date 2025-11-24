// src/jobs/syncSignusDemands.job.js
const { fetchAlbRecsRaw } = require("../integrations/signus.client");
const { log } = require("../utils/logger");

/**
 * FIX #8: Improved error handling and logging
 */
async function runDemandsSync() {
  try {
    log("📡 Starting Signus demands sync...");

    const albRecs = await fetchAlbRecsRaw();

    // FIX #8: Validate response
    if (!albRecs || !albRecs.data) {
      log("⚠️  Signus sync: No data returned from API");
      return { success: false, reason: "No data from API" };
    }

    if (!Array.isArray(albRecs.data)) {
      log("⚠️  Signus sync: API returned non-array data");
      return { success: false, reason: "Invalid data format" };
    }

    
    log("✅ Signus demands sync finished:", {
      created: albRecs.created,
      updated: albRecs.updated,
      errors: albRecs.errors,
      total: albRecs.total,
    });

    return { success: true, albRecs };
  } catch (err) {
    log("❌ Signus demands sync failed:", err.message);
    log("Stack trace:", err.stack);
    
    // In production, you might want to alert here
    // e.g., send to Sentry, PagerDuty, etc.
    
    return { success: false, error: err.message };
  }
}

/**
 * Start the sync loop
 * FIX #9: Configurable interval from environment
 */
function startDemandsSyncLoop() {
  // Run immediately on startup
  runDemandsSync();

  // Then run every hour (or from env config)
  const intervalMs = parseInt(process.env.SYNC_INTERVAL_MS) || 1000 * 60 * 60; // 1 hour default
  
  log(`⏰ Sync job scheduled every ${intervalMs / 1000 / 60} minutes`);
  
  setInterval(runDemandsSync, intervalMs);
}

module.exports = {
  runDemandsSync,
  startDemandsSyncLoop,
};