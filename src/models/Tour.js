// src/models/Tour.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const StopSchema = new Schema(
  {
    demand: { type: Schema.Types.ObjectId, ref: "Demand", required: true },

    order: { type: Number, required: true },

    status: {
      type: String,
      enum: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "PARTIAL", "NOT_READY"],
      default: "SCHEDULED",
    },

    plannedKg: Number,
    actualKg: Number,

    garageName: String, // denormalized for quick read
    garageId: String,   // signus garage code
    geo: {
      lat: Number,
      lng: Number,
    },
    address: {
      street: String,
      postalCode: String,
      city: String,
      municipality: String,
      province: String,
      region: String,
      country: String,
    },
    contact: {
      phone: String,
    },

    distanceFromPrevKm: Number,

    requestedAt: Date,
    deadlineAt: Date,
    priority: Number,

    startedAt: Date,
    completedAt: Date,
    notes: String,
  },
  { _id: true }
);

const TourSchema = new Schema(
  {
    driver: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
    date: { type: Date, required: true },

    status: {
      type: String,
      enum: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELED"],
      default: "SCHEDULED",
      index: true,
    },

    capacityKg: Number,
    totalDistanceKm: Number,
    remainingCapacityKg: Number,

    stops: [StopSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tour", TourSchema);
