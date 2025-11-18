// src/routes/tours.routes.js
const express = require("express");
const {
  completeStop,
  notReadyStop,
  partialStop,
} = require("../controllers/tours.controller");

const router = express.Router();

router.post("/tours/:tourId/stops/:stopId/complete", completeStop);
router.post("/tours/:tourId/stops/:stopId/not-ready", notReadyStop);
router.post("/tours/:tourId/stops/:stopId/partial", partialStop);

module.exports = router;
