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

const router = express.Router();

// GET /api/tours/active - Get all active tours
router.get("/tours/", getActiveTours);

// Get tour details
router.get("/tours/:tourId", getTour);

// Get all tours for a driver
router.get("/drivers/:driverId/tours", getDriverTours);

// Start a tour
router.post("/tours/:tourId/start", startTour);

// Complete a stop (with tire counts)
router.post("/tours/:tourId/stops/:stopId/complete", completeStop);

// Mark stop as not ready
router.post("/tours/:tourId/stops/:stopId/not-ready", notReadyStop);

// Mark stop as partial collection
router.post("/tours/:tourId/stops/:stopId/partial", partialStop);

module.exports = router;
