// src/server.js
const mongoose = require("mongoose");
const app = require("./app");
const config = require("./config")
const { log } = require("./utils/logger");
const { startDemandsSyncLoop } = require("./jobs/syncSignusDemands.job");

async function start() {
  try {
    await mongoose.connect(config.MONGO_URI);
    log("Connected to MongoDB");

    // start hourly Signus sync
    startDemandsSyncLoop();

    app.listen(config.PORT, () => {
      log(`Server listening on port ${config.PORT}`);
    });
  } catch (err) {
    log("Failed to start server:", err);
    process.exit(1);
  }
}

start();
