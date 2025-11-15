// src/routes/health.routes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

router.get("/health", async (req, res) => {
  const dbState = mongoose.connection.readyState; // 0=disconnected,1=connected
  res.json({
    status: "ok",
    db: dbState === 1 ? "connected" : "disconnected",
  });
});

module.exports = router;
