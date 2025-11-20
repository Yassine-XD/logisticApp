// src/models/signusAlbRec.model.js
const { Schema, model } = require("mongoose");

const SignusAlbRecSchema = new Schema(
  {
    // Link back to our main Demand document (big data)
    demand: { type: Schema.Types.ObjectId, ref: "Demand", index: true },

    // Signus identifiers
    sourceRef: { type: String, index: true },      // e.g. linea.codigo
    signusCodigo: { type: Number, index: true },   // albRec.codigo
    garageId: { type: String, index: true },       // codigoPgnu

    // Garage info (minimum needed for driver & map)
    garageName: String,
    geo: {
      lat: Number,
      lng: Number
    },
    address: {
      street: String,
      postalCode: String,
      city: String,
      province: String
    },

    // Contact info
    contactPhone: String,

    // Quantity to collect
    qtyEstimatedKg: Number,
    tiresQty: Number,

    // Dates
    requestedAt: Date,   // creation date
    deadlineAt: Date,    // expiring date

    // Status for planning (from our Demand logic)
    status: {
      type: String,
      index: true
      // e.g. NEW | CONFIRMING | CONFIRMED | SCHEDULED | COMPLETED | ...
    },

    // Mark if this record is currently a candidate for planning
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    // When was this snapshot last synced from Demand
    lastSyncedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true // createdAt, updatedAt
  }
);

module.exports = model("SignusAlbRec", SignusAlbRecSchema);
