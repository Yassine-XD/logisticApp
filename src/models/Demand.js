const mongoose = require("mongoose");

const DemandSchema = new mongoose.Schema(
  {
    externalId: { type: String, index: true },
    pickup: {
      address: String,
      location: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], default: [0, 0] },
      },
    },
    dropoff: {
      address: String,
      location: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], default: [0, 0] },
      },
    },
    status: { type: String, default: "pending" },
    metadata: Object,
  },
  { timestamps: true }
);

DemandSchema.index({ "pickup.location": "2dsphere" });
DemandSchema.index({ "dropoff.location": "2dsphere" });

module.exports = mongoose.model("Demand", DemandSchema);
