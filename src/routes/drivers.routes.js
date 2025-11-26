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
const { requestTour } = require("../controllers/tours.controller");
const {
  authenticateToken,
  requireRole,
} = require("../middleware/auth.middleware");
const router = express.Router();

// /api/drivers
router.get("/drivers", authenticateToken, requireRole("admin"), listDrivers);
router.get(
  "/drivers/:id",
  authenticateToken,
  requireRole("driver", "admin"),
  getDriver
);
router.post("/drivers", authenticateToken, requireRole("admin"), createDriver);

router.put(
  "/drivers/:id",
  authenticateToken,
  requireRole("admin"),
  updateDriver
);
router.delete(
  "/drivers/:id",
  authenticateToken,
  requireRole("admin"),
  deleteDriver
);
router.post(
  "/drivers/bulk",
  authenticateToken,
  requireRole("admin"),
  createDriversBulk
);

// Driver asks for his next tour
router.post(
  "/drivers/me/tours/request",
  authenticateToken,
  requireRole("driver", "admin"),
  requestTour
);

module.exports = router;
