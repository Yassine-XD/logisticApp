// src/routes/drivers.routes.js
const express = require("express");
const {
  listDrivers,
  getDriver,
  createDriver,
  updateDriver,
  deleteDriver,
  createDriversBulk
} = require("../controllers/drivers.controller");

const router = express.Router();

// /api/drivers
router.get("/drivers", listDrivers);
router.get("/drivers/:id", getDriver);
router.post("/drivers", createDriver);
router.put("/drivers/:id", updateDriver);
router.delete("/drivers/:id", deleteDriver);
router.post("/drivers/bulk", createDriversBulk);

module.exports = router;
