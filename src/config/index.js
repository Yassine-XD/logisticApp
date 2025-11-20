// src/config/index.js
const path = require("path");
require("dotenv").config({ path: "./.env" });

module.exports = {
  // Server
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",

  // Database
  MONGO_URI: process.env.DATABASE_URL || "mongodb://localhost:27017/volalte",

  // Signus API
  SIGNUS_USER: process.env.SIGNUS_USER,
  SIGNUS_PASS: process.env.SIGNUS_PASS,
  SIGNUS_CRC_CODE: process.env.SIGNUS_CRC_CODE || "R0805",
  SIGNUS_BASE_URL: process.env.SIGNUS_BASE_URL || "https://aplicacion.signus.es/api/rest",

  // Sync Job
  SYNC_INTERVAL_MS: parseInt(process.env.SYNC_INTERVAL_MS) || 3600000, // 1 hour

  // Defaults
  DEFAULT_TRUCK_CAPACITY_KG: parseInt(process.env.DEFAULT_TRUCK_CAPACITY_KG) || 3200,

  // Depot
  DEPOT_LAT: parseFloat(process.env.DEPOT_LAT) || 41.6506,
  DEPOT_LNG: parseFloat(process.env.DEPOT_LNG) || 1.8366,

  // Auth
  JWT_SECRET: process.env.JWT_SECRET || "change_this_in_production",

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};