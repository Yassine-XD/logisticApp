// src/routes/drivers.routes.js
const express = require("express");
const {
  listDrivers,
  getDriver,
  createDriver,
  updateDriver,
  deleteDriver,
  createDriversBulk,
} = require("../controllers/drivers.controller");
const { getDriverTours } = require("../controllers/tours.controller");
const { authenticateToken, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();
const manage = requireRole("admin", "dispatcher");

router.get("/drivers", authenticateToken, manage, listDrivers);
router.post("/drivers", authenticateToken, manage, createDriver);
router.post("/drivers/bulk", authenticateToken, requireRole("admin"), createDriversBulk);
router.get("/drivers/:id", authenticateToken, requireRole("admin", "dispatcher", "driver"), getDriver);
router.put("/drivers/:id", authenticateToken, manage, updateDriver);
router.delete("/drivers/:id", authenticateToken, manage, deleteDriver);

// A driver's tours (drivers may only read their own — enforced in controller)
router.get(
  "/drivers/:driverId/tours",
  authenticateToken,
  requireRole("admin", "dispatcher", "driver"),
  getDriverTours
);

module.exports = router;
