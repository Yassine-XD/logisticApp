// src/models/Demand.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const DemandSchema = new Schema(
  {
    signusId: { type: Number, unique: true, index: true }, // codigo
    sourceRef: String, // e.g. albRec codigo

    estadoCod: { type: String, index: true },
    estado: String,

    garageId: { type: String, index: true }, // Signus PGNU code
    garageName: String,

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

    qtyEstimatedKg: Number,
    unitsEstimated: Number,

    requestedAt: { type: Date, index: true },
    deadlineAt: { type: Date, index: true },

    notes: String, // observacionesPeticion (raw)

    // NEW:
    status: {
      type: String,
      enum: [
        "NEW",
        "CONFIRMING",
        "CONFIRMED",
        "SCHEDULED",
        "IN_PROGRESS",
        "PARTIAL",
        "COMPLETED",
        "NOT_READY",
        "EXPIRED",
        "CANCELED",
      ],
      default: "NEW",
      index: true,
    },
    priority: { type: Number, index: true },

    assigned: {
      driverId: { type: Schema.Types.ObjectId, ref: "Driver" },
      tourId: { type: Schema.Types.ObjectId, ref: "Tour" },
      date: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Demand", DemandSchema);
