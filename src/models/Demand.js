// src/models/Demand.js
// ── CANONICAL Demand schema ──────────────────────────────────────────────
// This is the ONE shape every reader/writer in the app agrees on.
// English field names are canonical; a few SIGNUS-native fields
// (estadoCod, estado) are kept because planning/eligibility filters on them.
const mongoose = require("mongoose");
const { Schema } = mongoose;

// Lifecycle of a demand inside our platform (distinct from SIGNUS estadoCod)
const DEMAND_STATUS = [
  "NEW", // just synced, plannable
  "SCHEDULED", // assigned to a tour (draft published)
  "IN_PROGRESS", // its tour started
  "COMPLETED", // collected
  "PARTIAL", // partially collected
  "NOT_READY", // driver found garage not ready → released
];

// SIGNUS estados we consider plannable
const PLANNABLE_ESTADOS = ["EN_CURSO", "ASIGNADA", "EN_TRANSITO"];

const DemandSchema = new Schema(
  {
    // ── Identifiers ──────────────────────────────────────────────
    signusId: { type: Number, required: true, unique: true, index: true }, // codigo
    signusAlbRec: { type: String, index: true }, // albarán code, e.g. "ALB2221666"
    garageId: { type: String, required: true, index: true }, // codigoPgnu
    garageName: { type: String },

    // ── SIGNUS state (native codes, used by planning filters) ────
    estadoCod: { type: String, index: true }, // EN_CURSO / ASIGNADA / EN_TRANSITO / ...
    estado: { type: String }, // human label ("Aceptada")

    // ── Our internal lifecycle ───────────────────────────────────
    status: {
      type: String,
      enum: DEMAND_STATUS,
      default: "NEW",
      index: true,
    },

    // ── Quantities ───────────────────────────────────────────────
    kg: { type: Number, required: true, default: 0 }, // kgSolicitadosEstimados
    unitsRequested: { type: Number, default: 0 }, // Σ lineasRecogidaManual.unidadesSolicitadas
    unidadesSolicitadas: { type: Number, default: 0 }, // alias kept for compatibility

    // ── Location ─────────────────────────────────────────────────
    geo: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },

    // ── Dates ────────────────────────────────────────────────────
    requestedAt: { type: Date, index: true }, // fechaPeticion
    deadlineAt: { type: Date, index: true }, // fechaMaxima
    collectedAt: { type: Date }, // fechaRealRecogida

    // ── Derived metrics (recomputed on read/plan) ────────────────
    ageDays: { type: Number, default: 0 },
    daysToDeadline: { type: Number, default: 999 },
    priority: { type: Number, default: 0, index: true },

    // ── Contact ──────────────────────────────────────────────────
    contactPhone: { type: String },
    contact: { phone: { type: String } }, // nested alias used by some readers

    // ── Address ──────────────────────────────────────────────────
    address: {
      street: { type: String },
      postalCode: { type: String },
      city: { type: String },
      municipality: { type: String },
      province: { type: String },
      region: { type: String },
      country: { type: String },
    },

    // ── Assignment (set when scheduled onto a tour) ──────────────
    assigned: {
      driverId: { type: Schema.Types.ObjectId, ref: "Driver" },
      tourId: { type: Schema.Types.ObjectId, ref: "Tour" },
      planId: { type: Schema.Types.ObjectId, ref: "Plan" },
      date: { type: Date },
      seq: { type: Number },
    },

    // Raw SIGNUS payload for audit/debug
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

DemandSchema.index({ garageId: 1, deadlineAt: 1 });
DemandSchema.index({ "address.province": 1, priority: -1 });
DemandSchema.index({ estadoCod: 1, status: 1 });

DemandSchema.statics.DEMAND_STATUS = DEMAND_STATUS;
DemandSchema.statics.PLANNABLE_ESTADOS = PLANNABLE_ESTADOS;

module.exports = mongoose.model("Demand", DemandSchema);
module.exports.DEMAND_STATUS = DEMAND_STATUS;
module.exports.PLANNABLE_ESTADOS = PLANNABLE_ESTADOS;
