const http = require("http");
const mongoose = require("mongoose");
const app = require("./app");
const config = require("./config");
const logger = require("./utils/logger");
const syncJob = require("./jobs/syncSignusDemands.job");

const server = http.createServer(app);

mongoose
  .connect(config.MONGO_URI, {})
  .then(() => {
    logger.info("Connected to MongoDB");
    server.listen(config.PORT, () => {
      logger.info(`Server listening on port ${config.PORT}`);
    });
    // start scheduled jobs
    syncJob.start();
  })
  .catch((err) => {
    logger.error("MongoDB connection error", err);
    process.exit(1);
  });

// graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  syncJob.stop();
  await mongoose.disconnect();
  server.close(() => process.exit(0));
});
