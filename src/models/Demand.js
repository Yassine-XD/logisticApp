// src/models/Demand.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const DemandSchema = new Schema(
  {
    signusId: { type: Number, unique: true, index: true },  // codigo

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

    // 🔹 link to Garage master (optional, we can backfill later)
    garage: { type: Schema.Types.ObjectId, ref: "Garage" },

    raw: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Demand", DemandSchema);
