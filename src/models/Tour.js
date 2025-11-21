// src/models/Tour.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const StopSchema = new Schema(
  {
    demand: { type: Schema.Types.ObjectId, ref: "Demand", required: true },
    
    // SIGNUS traceability fields
    signusId: { type: Number, index: true },           // SIGNUS demand code (e.g., 2223039)
    signusAlbRec: { type: String, index: true },       // SIGNUS albarán code (e.g., "ALB2223039")

    order: { type: Number, required: true },

    status: {
      type: String,
      enum: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "PARTIAL", "NOT_READY"],
      default: "SCHEDULED",
    },

    // Planned vs Actual
    plannedKg: Number,
    actualKg: Number,

    // NEW: Tire count tracking
    smallTires: { type: Number, default: 0 },      // 8.58 kg each
    mediumTires: { type: Number, default: 0 },     // 59 kg each

    // Garage info (denormalized for quick read)
    garageName: String,
    garageId: String,
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
      enum: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELED"],
      default: "PLANNED",
      index: true,
    },

    // Vehicle capacity at tour creation
    capacityKg: { type: Number, required: true },
    
    // Tour metrics
    totalDistanceKm: Number,
    remainingCapacityKg: Number,

    // Collection summary (calculated from stops)
    totalPlannedKg: { type: Number, default: 0 },
    totalActualKg: { type: Number, default: 0 },
    totalSmallTires: { type: Number, default: 0 },
    totalMediumTires: { type: Number, default: 0 },

    stops: [StopSchema],
  },
  { timestamps: true }
);

// Method to calculate tour totals
TourSchema.methods.calculateTotals = function() {
  this.totalPlannedKg = this.stops.reduce((sum, stop) => sum + (stop.plannedKg || 0), 0);
  this.totalActualKg = this.stops.reduce((sum, stop) => sum + (stop.actualKg || 0), 0);
  this.totalSmallTires = this.stops.reduce((sum, stop) => sum + (stop.smallTires || 0), 0);
  this.totalMediumTires = this.stops.reduce((sum, stop) => sum + (stop.mediumTires || 0), 0);
  
  // Recalculate remaining capacity based on actual collections
  this.remainingCapacityKg = this.capacityKg - this.totalActualKg;
};

// Auto-calculate totals before saving
TourSchema.pre('save', function(next) {
  this.calculateTotals();
  next();
});

module.exports = mongoose.model("Tour", TourSchema);