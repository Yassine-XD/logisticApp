const mongoose = require("mongoose");

const GarageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: String,
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
  },
  { timestamps: true }
);

GarageSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Garage", GarageSchema);
