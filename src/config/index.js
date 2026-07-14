// src/config/index.js
// Centralized configuration. Every value here is overridable via env vars.
// Runtime-tunable operational parameters live in the Settings singleton
// (see src/models/Settings.js) — this file only provides the boot defaults.
require("dotenv").config({ path: process.env.ENV_PATH || "./.env" });

function num(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  // Server
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  WEB_ORIGIN: process.env.WEB_ORIGIN || "*", // CORS allow-list (comma separated)

  // Database
  MONGO_URI:
    process.env.MONGO_URI ||
    process.env.DATABASE_URL ||
    "mongodb://localhost:27017/volalte",

  // SIGNUS integration
  SIGNUS_MODE: (process.env.SIGNUS_MODE || "mock").toLowerCase(), // mock | live
  SIGNUS_USER: process.env.SIGNUS_USER,
  SIGNUS_PASS: process.env.SIGNUS_PASS,
  SIGNUS_CRC_CODE: process.env.SIGNUS_CRC_CODE || "R0805",
  SIGNUS_BASE_URL:
    process.env.SIGNUS_BASE_URL || "https://aplicacion.signus.es/api/rest",
  SIGNUS_LOOKBACK_MONTHS: parseInt(process.env.SIGNUS_LOOKBACK_MONTHS, 10) || 3,

  // Optimization engine (Python OR-Tools service)
  ENGINE_URL: process.env.ENGINE_URL || "http://localhost:8000",
  ENGINE_API_KEY: process.env.ENGINE_API_KEY || "",
  ENGINE_TIMEOUT_MS: parseInt(process.env.ENGINE_TIMEOUT_MS, 10) || 90000,

  // Sync cron (node-cron expression). Default: every hour at minute 5.
  SYNC_CRON: process.env.SYNC_CRON || "5 * * * *",
  SYNC_ON_BOOT: process.env.SYNC_ON_BOOT !== "false",

  // Operational defaults (seed the Settings doc; editable at runtime)
  COMPANY_NAME: process.env.COMPANY_NAME || "Volalte",
  ACCENT_COLOR: process.env.ACCENT_COLOR || "#0f766e",
  DEFAULT_TRUCK_CAPACITY_KG:
    parseInt(process.env.DEFAULT_TRUCK_CAPACITY_KG, 10) || 3200,
  DEPOT_LAT: num(process.env.DEPOT_LAT, 41.723), // Manresa
  DEPOT_LNG: num(process.env.DEPOT_LNG, 1.8266),
  SMALL_TIRE_KG: num(process.env.SMALL_TIRE_KG, 8.58),
  MEDIUM_TIRE_KG: num(process.env.MEDIUM_TIRE_KG, 59),
  URGENCY_THRESHOLD_DAYS: num(process.env.URGENCY_THRESHOLD_DAYS, 2),
  CAPACITY_TARGET_PCT: num(process.env.CAPACITY_TARGET_PCT, 80),
  WORKDAY_START_HOUR: parseInt(process.env.WORKDAY_START_HOUR, 10) || 8,
  WORKDAY_LENGTH_HOURS: num(process.env.WORKDAY_LENGTH_HOURS, 9),
  MAX_TOURS_PER_DRIVER: parseInt(process.env.MAX_TOURS_PER_DRIVER, 10) || 3,

  // Auth
  JWT_SECRET: process.env.JWT_SECRET || "dev_access_secret_change_me",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "30d",

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};
