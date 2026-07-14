// src/server.js
const mongoose = require("mongoose");
const app = require("./app");
const config = require("./config");
const Settings = require("./models/Settings");
const { startSyncJob } = require("./jobs/sync.job");
const { log } = require("./utils/logger");

async function start() {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(config.MONGO_URI);
    log(`Connected to MongoDB (${config.MONGO_URI.replace(/\/\/.*@/, "//***@")})`);

    // Ensure the settings singleton exists on boot
    await Settings.getSettings({ fresh: true });

    if (config.NODE_ENV !== "test") {
      startSyncJob();
    }

    const server = app.listen(config.PORT, () => {
      log(`API listening on :${config.PORT} [${config.NODE_ENV}] · SIGNUS=${config.SIGNUS_MODE}`);
    });

    const shutdown = (sig) => {
      log(`${sig} received, shutting down...`);
      server.close(() => mongoose.connection.close(false).then(() => process.exit(0)));
      setTimeout(() => process.exit(1), 8000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    log.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

if (require.main === module) start();

module.exports = { start };
