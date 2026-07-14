// src/routes/health.routes.js
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const config = require("../config");

const router = express.Router();

// Public health check — Mongo + engine reachability.
router.get("/health", async (req, res) => {
  const db = mongoose.connection.readyState === 1 ? "connected" : "disconnected";

  let engine = "unknown";
  try {
    await axios.get(`${config.ENGINE_URL}/health`, { timeout: 2500 });
    engine = "reachable";
  } catch (_) {
    engine = "unreachable";
  }

  const ok = db === "connected";
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    db,
    engine,
    signusMode: config.SIGNUS_MODE,
    uptimeSec: Math.round(process.uptime()),
  });
});

module.exports = router;
