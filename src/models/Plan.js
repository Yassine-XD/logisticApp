// src/models/Plan.js
// A Plan is the DRAFT output of the optimization engine for a given date.
// The dispatcher reviews/edits it on the map, then PUBLISHES it → Tours.
const mongoose = require("mongoose");
const { Schema } = mongoose;

const PlanStopSchema = new Schema(
  {
    demand: { type: Schema.Types.ObjectId, ref: "Demand", required: true },
    signusId: { type: Number },
    signusAlbRec: { type: String },
    garageId: { type: String },
    garageName: { type: String },
    sequence: { type: Number, default: 0 },
    plannedKg: { type: Number, default: 0 },
    geo: { lat: Number, lng: Number },
    address: {
      street: String,
      postalCode: String,
      city: String,
      municipality: String,
      province: String,
      region: String,
      country: String,
    },
    contactPhone: String,
    deadlineAt: Date,
    requestedAt: Date,
    daysToDeadline: Number,
    priority: Number,
    isUrgent: { type: Boolean, default: false },
    distanceFromPrevious: Number,
  },
  { _id: false }
);

const PlanRouteSchema = new Schema(
  {
    routeId: { type: String },
    driver: { type: Schema.Types.ObjectId, ref: "Driver" },
    driverName: { type: String },
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle" },
    vehicleId: { type: String }, // engine-side id (driver-tour slot)
    vehiclePlate: { type: String },
    tourIndex: { type: Number, default: 0 },
    capacityKg: { type: Number, default: 0 },
    totalKg: { type: Number, default: 0 },
    totalDistanceKm: { type: Number, default: 0 },
    estimatedDurationHours: { type: Number, default: 0 },
    capacityUtilizationPercent: { type: Number, default: 0 },
    urgentCount: { type: Number, default: 0 },
    stops: [PlanStopSchema],
  },
  { _id: true }
);

const PlanSchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "DISCARDED"],
      default: "DRAFT",
      index: true,
    },
    algorithm: {
      type: String,
      enum: ["engine", "greedy-fallback"],
      default: "engine",
    },
    optimizationId: { type: String },
    summary: { type: Schema.Types.Mixed },
    routes: [PlanRouteSchema],
    unassigned: [PlanStopSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Plan", PlanSchema);
