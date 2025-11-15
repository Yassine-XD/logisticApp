// src/models/Tour.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const TourStopSchema = new Schema(
  {
    seq: { type: Number, required: true }, // 1,2,3,...

    // link back to demand & garage
    demand: { type: Schema.Types.ObjectId, ref: "Demand" },
    garage: { type: Schema.Types.ObjectId, ref: "Garage" },

    // quantities
    plannedKg: Number,
    actualKg: Number,

    // timing
    eta: Date,          // planned arrival
    etaEnd: Date,       // optional planned end
    arrivalAt: Date,    // real
    departureAt: Date,  // real

    // status of this stop
    status: {
      type: String,
      enum: ["PLANNED", "IN_PROGRESS", "COMPLETED", "SKIPPED", "CANCELED"],
      default: "PLANNED",
    },

    // useful for mobile
    googleMapsUrl: String,
    notes: String,
  },
  { _id: true }
);

const TourSchema = new Schema(
  {
    date: { type: Date, index: true }, // day of the tour

    driver: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle" },

    status: {
      type: String,
      enum: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELED"],
      default: "PLANNED",
      index: true,
    },

    // capacity info (copied from Vehicle at planning time)
    capacityKg: Number,

    // aggregate metrics (computed by planner or later)
    totalPlannedKg: Number,
    totalActualKg: Number,
    totalDistanceKm: Number,
    totalDurationMin: Number,

    // ordered list of stops
    stops: [TourStopSchema],

    // free field to store optimizer / LLM metadata
    meta: {
      source: String,        // "ortools" | "llm" | "manual"
      runId: String,         // id of optimization run
      score: Number,         // objective value if any
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tour", TourSchema);
