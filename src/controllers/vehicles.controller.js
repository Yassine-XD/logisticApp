// src/controllers/vehicles.controller.js
const Vehicle = require("../models/Vehicle");
const { log } = require("../utils/logger");

// GET /vehicles
async function listVehicles(req, res, next) {
  try {
    const { active } = req.query;
    const filter = {};

    if (active === "true") filter.active = true;
    if (active === "false") filter.active = false;

    const vehicles = await Vehicle.find(filter);
    res.json(vehicles);
  } catch (err) {
    next(err);
  }
}

// GET /vehicles/:id
async function getVehicle(req, res, next) {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    res.json(vehicle);
  } catch (err) {
    next(err);
  }
}

// POST /vehicles
async function createVehicle(req, res, next) {
  try {
    const { plate, alias, capacityKg, volumeM3, type, active } = req.body;

    const vehicle = await Vehicle.create({
      plate,
      alias,
      capacityKg,
      volumeM3,
      type,
      active,
    });

    res.status(201).json(vehicle);
  } catch (err) {
    next(err);
  }
}

// PUT /vehicles/:id
async function updateVehicle(req, res, next) {
  try {
    const { id } = req.params;
    const update = req.body;

    const vehicle = await Vehicle.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    res.json(vehicle);
  } catch (err) {
    next(err);
  }
}

// DELETE /vehicles/:id  (soft delete: active = false)
async function deleteVehicle(req, res, next) {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findByIdAndUpdate(
      id,
      { active: false },
      { new: true }
    );

    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    log(`Vehicle ${id} marked as inactive`);
    res.json({ success: true, vehicle });
  } catch (err) {
    next(err);
  }
}

// POST /vehicles/bulk
async function createVehiclesBulk(req, res, next) {
  try {
    const vehicles = req.body;

    if (!Array.isArray(vehicles)) {
      return res.status(400).json({ error: "Body must be an array" });
    }

    const created = await Vehicle.insertMany(vehicles, { ordered: false });

    res.status(201).json({
      success: true,
      count: created.length,
      vehicles: created
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  createVehiclesBulk
};

