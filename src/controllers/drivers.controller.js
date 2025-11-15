// src/controllers/drivers.controller.js
const Driver = require("../models/Driver");
const { log } = require("../utils/logger");

// GET /drivers
async function listDrivers(req, res, next) {
  try {
    const { active } = req.query;
    const filter = {};

    if (active === "true") filter.active = true;
    if (active === "false") filter.active = false;

    const drivers = await Driver.find(filter).populate("vehicle");
    res.json(drivers);
  } catch (err) {
    next(err);
  }
}

// GET /drivers/:id
async function getDriver(req, res, next) {
  try {
    const { id } = req.params;
    const driver = await Driver.findById(id).populate("vehicle");
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    res.json(driver);
  } catch (err) {
    next(err);
  }
}

// POST /drivers
async function createDriver(req, res, next) {
  try {
    const {
      name,
      phone,
      signusCode,
      nif,
      vehicle,    // vehicle ObjectId (optional)
      active,
      homeBase,
    } = req.body;

    const driver = await Driver.create({
      name,
      phone,
      signusCode,
      nif,
      vehicle,
      active,
      homeBase,
    });

    res.status(201).json(driver);
  } catch (err) {
    next(err);
  }
}

// PUT /drivers/:id
async function updateDriver(req, res, next) {
  try {
    const { id } = req.params;
    const update = req.body;

    const driver = await Driver.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).populate("vehicle");

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    res.json(driver);
  } catch (err) {
    next(err);
  }
}

// DELETE /drivers/:id  (soft delete: active = false)
async function deleteDriver(req, res, next) {
  try {
    const { id } = req.params;

    const driver = await Driver.findByIdAndUpdate(
      id,
      { active: false },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    log(`Driver ${id} marked as inactive`);
    res.json({ success: true, driver });
  } catch (err) {
    next(err);
  }
}

// POST /drivers/bulk
async function createDriversBulk(req, res, next) {
  try {
    const drivers = req.body;

    if (!Array.isArray(drivers)) {
      return res.status(400).json({ error: "Body must be an array" });
    }

    const created = await Driver.insertMany(drivers, { ordered: false });

    res.status(201).json({
      success: true,
      count: created.length,
      drivers: created,
    });
  } catch (err) {
    next(err);
  }
}


module.exports = {
  listDrivers,
  getDriver,
  createDriver,
  updateDriver,
  deleteDriver,
  createDriversBulk
};
