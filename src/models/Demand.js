// src/models/Demand.js - FIXED TO MATCH ACTUAL SIGNUS DATA
const mongoose = require("mongoose");
const { Schema } = mongoose;

const DemandSchema = new Schema(
  {
    // SIGNUS identifiers
    signusId: { type: Number, unique: true, index: true, required: true }, // codigo from SIGNUS
    signusAlbRec: { type: String, index: true }, // Full albarán code from SIGNUS

    // Status from SIGNUS (estadoCod, estado)
    estadoCod: { type: String, index: true }, // "EN_CURSO", "ASIGNADA", "EN_TRANSITO"
    estado: String, // Human readable: "En curso", "En tránsito"

    // Garage (PGNU) info
    garageId: { type: String, index: true }, // codigoPgnu: "G0803711"
    garageName: String, // nombrePgnu: "Rodi Motor Services"

    // Location - CORRECT STRUCTURE
    geo: {
      lat: { type: Number, required: true }, // latitud: 41.39826
      lng: { type: Number, required: true }, // longitud: 2.1655
    },

    // Address - FIXED: No localidad, just municipio
    address: {
      street: String,         // direccion: "AV/ DIAGONAL, 404"
      postalCode: String,     // codigoPostal: "08037"
      city: String,           // municipio: "Barcelona" (NO localidad!)
      municipality: String,   // municipio: "Barcelona"
      province: String,       // provincia: "Barcelona"
      region: String,         // comunidad: "Cataluña"
      country: String,        // pais: "España"
    },

    // Contact
    contact: {
      phone: String, // telefonoPgnu: "934594051"
    },

    // Quantities - CORRECT FIELD NAMES
    qtyEstimatedKg: { type: Number, index: true }, // kgSolicitadosEstimados: 1287
    unitsEstimated: Number, // unidadesSolicitadas: 150

    // Dates from SIGNUS
    requestedAt: { type: Date, index: true }, // fechaPeticion
    deadlineAt: { type: Date, index: true },  // fechaMaxima
    actualCollectionAt: Date, // fechaRealRecogida (usually null until collected)

    // Notes from SIGNUS
    notes: String, // observacionesPeticion: "urgente"

    // INTERNAL STATUS (our system's tracking)
    status: {
      type: String,
      enum: [
        "NEW",          // Just synced from SIGNUS
        "CONFIRMING",   // We're validating it
        "CONFIRMED",    // Ready for planning
        "SCHEDULED",    // Assigned to a tour
        "IN_PROGRESS",  // Driver is on the way
        "PARTIAL",      // Partially collected
        "COMPLETED",    // Fully collected
        "NOT_READY",    // Garage not ready
        "EXPIRED",      // Past deadline
        "CANCELED",     // Cancelled
      ],
      default: "NEW",
      index: true,
    },

    // Priority score (0-100, calculated at sync time)
    priority: { type: Number, index: true, default: 0 },

    // Assignment tracking
    assigned: {
      driverId: { type: Schema.Types.ObjectId, ref: "Driver" },
      tourId: { type: Schema.Types.ObjectId, ref: "Tour" },
      date: Date,
    },

    // IMPORTANT: Keep complete raw SIGNUS data for debugging/audit
    raw: { type: Schema.Types.Mixed },
  },
  { 
    timestamps: true,
    // Add index for common queries
    indexes: [
      { estadoCod: 1, priority: -1 },
      { status: 1, priority: -1 },
      { garageId: 1, requestedAt: -1 },
    ]
  }
);

// Add index for geospatial queries (if needed in future)
DemandSchema.index({ geo: "2dsphere" });

module.exports = mongoose.model("Demand", DemandSchema);