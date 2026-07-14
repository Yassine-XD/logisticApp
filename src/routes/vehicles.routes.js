// src/routes/vehicles.routes.js
const express = require("express");
const {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  createVehiclesBulk,
} = require("../controllers/vehicles.controller");
const { authenticateToken, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();
const manage = requireRole("admin", "dispatcher");

router.get("/vehicles", authenticateToken, listVehicles);
router.post("/vehicles", authenticateToken, manage, createVehicle);
router.post("/vehicles/bulk", authenticateToken, requireRole("admin"), createVehiclesBulk);
router.get("/vehicles/:id", authenticateToken, getVehicle);
router.put("/vehicles/:id", authenticateToken, manage, updateVehicle);
router.delete("/vehicles/:id", authenticateToken, manage, deleteVehicle);

module.exports = router;
