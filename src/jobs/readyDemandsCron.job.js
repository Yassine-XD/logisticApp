// src/jobs/readyDemandsCron.job.js
const cron = require("node-cron");
const {
  refreshReadyDemandsFromDemands,
} = require("../services/ready.demands.service");
const { log } = require("../utils/logger");
const { startDemandsSyncLoop } = require("./syncSignusDemands.job");

//Collectinf data from signus endpoint and store it
cron.schedule("35 * * * *", async () => {
  try {
    log("[CRON] Starting Collecting Data...");
    startDemandsSyncLoop();
    log("[CRON] The Data Collected...");
  } catch (err) {
    log("[CRON] Collecting Data FAILED:", err);
  }
});

// filtering the data collected to be ready for use
cron.schedule("29 * * * *", async () => {
  try {
    log("[CRON] Starting ReadyDemands refresh...");
    const result = await refreshReadyDemandsFromDemands();
    log("[CRON] ReadyDemands refresh done:", result);
  } catch (err) {
    log("[CRON] ReadyDemands refresh FAILED:", err);
  }
});