// src/models/Demand.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const DemandSchema = new Schema(
  {
    signusId: { type: Number, unique: true, index: true }, // codigo

    estadoCod: { type: String, index: true },
    estado: String,

    // PGNU code from Signus
    codigoPgnu: { type: String, index: true },
    nombrePgnu: String,
    telefonoPgnu: String,

    latitud: Number,
    longitud: Number,
    direccion: String,
    codigoPostal: String,
    municipio: String,
    provincia: String,
    comunidad: String,
    pais: String,

    kgSolicitadosEstimados: Number,
    unidadesSolicitadas: Number,

    fechaPeticion: { type: Date, index: true },
    fechaMaxima: { type: Date, index: true },
    fechaRealRecogida: Date,

    observacionesPeticion: String,
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
      seq: Number,
    },
  },
  { timestamps: true }
);

DemandSchema.index({ geo: "2dsphere" });

module.exports = mongoose.model("Demand", DemandSchema);
