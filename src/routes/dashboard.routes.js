// src/routes/dashboard.routes.js
const express = require("express");
const {
  getStats,
  getActivity,
  getTourLocations,
  getDashboard,
} = require("../controllers/dashboard.controller");

const router = express.Router();

// Combined endpoint (RECOMMENDED) - returns everything in one call
router.get("/dashboard", getDashboard);

// Separate endpoints (if you prefer granular control)
router.get("/dashboard/stats", getStats);
router.get("/dashboard/activity", getActivity);
router.get("/dashboard/tour-locations", getTourLocations);

module.exports = router;
