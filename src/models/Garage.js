// src/models/Garage.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const GarageSchema = new Schema(
  {
    // Signus identifiers
    signusCode: { type: String, required: true, unique: true, index: true }, // codigoPgnu, e.g. "G0803711"
    name: { type: String, required: true },                                   // nombrePgnu
    cif: { type: String },
    phone: { type: String },

    // location
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], index: "2dsphere" }, // [lng, lat]
    },

    address: {
      street: String,
      postalCode: String,
      city: String,        // localidad / municipio
      province: String,
      region: String,      // comunidad
      country: String,
    },

    // business rules
    active: { type: Boolean, default: true },

    // optional working hours (simple for MVP)
    timeWindows: [
      {
        label: String,         // e.g. "L-V"
        start: String,         // "08:30"
        end: String,           // "18:30"
      },
    ],

    // quality metrics (filled later from completed demands)
    metrics: {
      deliveredVsDeclaredRatio: { type: Number, default: 1 }, // average actual/estimated
      avgResponseTimeHours: { type: Number, default: 0 },
      cancellationRate: { type: Number, default: 0 },
      reliabilityScore: { type: Number, default: 0 }, // 0–100
    },

    notes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Garage", GarageSchema);
