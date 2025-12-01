// src/models/Demand.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const DemandSchema = new Schema(
  {
    // SIGNUS / demand identifiers
    signusId: { type: Number, required: true, unique: true, index: true }, // 2221760
    garageId: { type: String, required: true, index: true },               // "G0890308"
    garageName: { type: String },                                          // "AUTO 2000"

    // Total kg requested for this demand
    kg: { type: Number, required: true },                                  // 3432

    // Location (can be missing → NOT required)
    geo: {
      lng: { type: Number, default: null },                                // undefined in your logs
      lat: { type: Number, default: null },
    },

    // Dates
    requestedAt: { type: Date, required: true, index: true },              // 2025-11-13T23:00:00.000Z
    deadlineAt: { type: Date, required: true, index: true },               // 2025-11-28T22:59:59.000Z

    // Derived metrics (optional, can be recomputed)
    ageDays: { type: Number },                                             // 13.6
    daysToDeadline: { type: Number },                                      // 1.4

    // Our internal priority score (0–100)
    priority: { type: Number, default: 0, index: true },                   // 76

    // Contact
    contactPhone: { type: String },                                        // "934406572"

    // Address (normalized from SIGNUS data)
    address: {
      street: { type: String },                                            // "C/ CLARET, 18"
      postalCode: { type: String },                                        // "08903"
      city: { type: String },                                              // "HOSPITALET DE LLOBREGAT, L'"
      municipality: { type: String },                                      // "Hospitalet de Llobregat, L'"
      province: { type: String },                                          // "Barcelona"
      region: { type: String },                                            // "Cataluña"
      country: { type: String },                                           // "España"
    },

    // Optional: keep full raw SIGNUS payload for debug/audit
    raw: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
  }
);

// Helpful indexes for queries
DemandSchema.index({ garageId: 1, deadlineAt: 1 });
DemandSchema.index({ "address.province": 1, priority: -1 });
DemandSchema.index({ "address.city": 1, priority: -1 });

// If later you switch to GeoJSON, you can add a 2dsphere index,
// but with {lat, lng} you should NOT use a 2dsphere index directly.

module.exports = mongoose.model("Demand", DemandSchema);
