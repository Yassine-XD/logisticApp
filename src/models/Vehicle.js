// src/models/Vehicle.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const VehicleSchema = new Schema(
  {
    plate: { type: String, required: true, unique: true }, // e.g. "6539MVS"
    alias: { type: String }, // e.g. "Camión Samuel"

    capacityKg: { type: Number }, // max load used by planner
    volumeM3: { type: Number }, // optional, for future

    type: { type: String, enum: ["van", "truck", "other"], default: "truck" },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", VehicleSchema);
