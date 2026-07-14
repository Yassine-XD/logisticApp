// src/routes/tours.routes.js
const express = require("express");
const {
  getActiveTours,
  getMyTours,
  getTour,
  startTour,
  completeStop,
  partialStop,
  notReadyStop,
} = require("../controllers/tours.controller");
const { authenticateToken, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();
const driverOrUp = requireRole("admin", "dispatcher", "driver");

router.get("/tours/active", authenticateToken, requireRole("admin", "dispatcher"), getActiveTours);
router.get("/tours/mine", authenticateToken, requireRole("driver", "admin"), getMyTours);
router.get("/tours/:tourId", authenticateToken, driverOrUp, getTour);

router.post("/tours/:tourId/start", authenticateToken, driverOrUp, startTour);
router.post("/tours/:tourId/stops/:stopId/complete", authenticateToken, driverOrUp, completeStop);
router.post("/tours/:tourId/stops/:stopId/partial", authenticateToken, driverOrUp, partialStop);
router.post("/tours/:tourId/stops/:stopId/not-ready", authenticateToken, driverOrUp, notReadyStop);

module.exports = router;
