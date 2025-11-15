// src/models/Driver.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const DriverSchema = new Schema(
  {
    // internal ID, not Signus
    name: { type: String, required: true },
    phone: { type: String },

    // optional link to Signus driver code (codigoConductor)
    signusCode: { type: String, index: true }, // e.g. "DBHW"
    nif: { type: String },

    // the vehicle (truck/van) this driver usually uses
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle" },

    active: { type: Boolean, default: true },

    // for future: where they usually start / end
    homeBase: {
      lat: Number,
      lng: Number,
      address: String,
    },

    // simple performance placeholders (we'll compute later)
    stats: {
      totalKgCollected: { type: Number, default: 0 },
      totalStops: { type: Number, default: 0 },
      reliabilityScore: { type: Number, default: 0 }, // 0–100
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Driver", DriverSchema);
