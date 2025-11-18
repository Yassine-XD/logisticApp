// src/routes/index.js
const express = require("express");
const healthRoutes = require("./health.routes");
const demandsRoutes = require("./demands.routes");
const driversRoutes = require("./drivers.routes");
const vehiclesRoutes = require("./vehicles.routes");
const planRoutes = require("./plan.routes");
const toursRoutes = require("./tours.routes");

const router = express.Router();

router.use(healthRoutes);
router.use(demandsRoutes);
router.use(driversRoutes);
router.use(vehiclesRoutes);
router.use(planRoutes);
router.use(toursRoutes);

module.exports = router;
