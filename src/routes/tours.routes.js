// src/routes/tours.routes.js
const express = require("express");
const {
  startTour,
  completeStop,
  notReadyStop,
  partialStop,
  getTour,
  getDriverTours,
  getActiveTours,
} = require("../controllers/tours.controller");

const {
  authenticateToken,
  requireRole,
} = require("../middleware/auth.middleware");

const router = express.Router();

// GET /api/tours/active - Get all active tours
router.get("/tours/active", authenticateToken, getActiveTours);

// Get tour details
router.get("/tours/:tourId", authenticateToken, getTour);

// Get all tours for a driver
router.get("/drivers/:driverId/tours", authenticateToken, getDriverTours);

// Start a tour
router.post("/tours/:tourId/start", authenticateToken, startTour);

// Complete a stop (with tire counts)
router.post(
  "/tours/:tourId/stops/:stopId/complete",
  authenticateToken,
  requireRole("driver", "admin"),
  completeStop
);

// Mark stop as not ready
router.post(
  "/tours/:tourId/stops/:stopId/not-ready",
  authenticateToken,
  requireRole("driver", "admin"),
  notReadyStop
);

// Mark stop as partial collection
router.post(
  "/tours/:tourId/stops/:stopId/partial",
  authenticateToken,
  requireRole("driver", "admin"),
  partialStop
);

module.exports = router;
