// src/models/Driver.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const DriverSchema = new Schema(
  {
    // Basic info
    name: { type: String, required: true },
    phone: { type: String },

    // Optional link to Signus driver code
    signusCode: { type: String, index: true },
    nif: { type: String },

    // Vehicle assignment
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle" },

    active: { type: Boolean, default: true },

    // Home base for route planning
    homeBase: {
      lat: Number,
      lng: Number,
      address: String,
    },

    // Performance metrics
    stats: {
      totalKgCollected: { type: Number, default: 0 },
      totalStops: { type: Number, default: 0 },
      reliabilityScore: { type: Number, default: 0 }, // 0–100
    },

    // Daily tour limit (stops are now dynamic based on capacity)
    maxDailyTours: { type: Number, default: 3 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Driver", DriverSchema);