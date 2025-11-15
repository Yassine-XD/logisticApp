// src/routes/vehicles.routes.js
const express = require("express");
const {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  createVehiclesBulk
} = require("../controllers/vehicles.controller");

const router = express.Router();

// /api/vehicles
router.get("/vehicles", listVehicles);
router.get("/vehicles/:id", getVehicle);
router.post("/vehicles", createVehicle);
router.put("/vehicles/:id", updateVehicle);
router.delete("/vehicles/:id", deleteVehicle);
router.post("/vehicles/bulk", createVehiclesBulk);


module.exports = router;
