// src/routes/dashboard.routes.js
const express = require("express");
const {
  getStats,
  getActivity,
  getTourLocations,
  getDashboard,
} = require("../controllers/dashboard.controller");
const {
  authenticateToken,
  requireRole,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.get(
  "/dashboard",
  authenticateToken,
  requireRole("admin", "dispatcher"),
  getDashboard
);

router.get(
  "/dashboard/stats",
  authenticateToken,
  requireRole("admin", "dispatcher"),
  getStats
);
router.get("/dashboard/activity", authenticateToken, getActivity);
router.get("/dashboard/tour-locations", authenticateToken, getTourLocations);

module.exports = router;
