// src/routes/tours.routes.js
const express = require("express");
const {
  startTour,
  completeStop,
  notReadyStop,
  partialStop,
} = require("../controllers/tours.controller");

const router = express.Router();

// Start a tour
router.post("/tours/:tourId/start", startTour);

// Complete a stop
router.post("/tours/:tourId/stops/:stopId/complete", completeStop);

// Mark stop as not ready
router.post("/tours/:tourId/stops/:stopId/not-ready", notReadyStop);

// Mark stop as partial
router.post("/tours/:tourId/stops/:stopId/partial", partialStop);

module.exports = router;