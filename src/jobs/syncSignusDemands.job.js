const cron = require("node-cron");
const signus = require("../integrations/signus.client");
const demandsService = require("../services/demands.service");
const logger = require("../utils/logger");

const task = cron.schedule(
  "*/5 * * * *",
  async () => {
    logger.info("syncSignusDemands.job: starting fetch");
    try {
      const remote = await signus.fetchDemands();
      for (const item of remote) {
        // assume item has id -> externalId and other payload
        const externalId = item.id || item.externalId;
        if (!externalId) continue;
        const payload = {
          externalId,
          pickup: item.pickup || {},
          dropoff: item.dropoff || {},
          status: item.status || "pending",
          metadata: item.metadata || {},
        };
        await demandsService.upsertByExternalId(externalId, payload);
      }
      logger.info(`syncSignusDemands.job: synced ${remote.length} items`);
    } catch (err) {
      logger.error("syncSignusDemands.job failed", err);
    }
  },
  {
    scheduled: false,
  }
);

module.exports = {
  start: () => task.start(),
  stop: () => task.stop(),
};
