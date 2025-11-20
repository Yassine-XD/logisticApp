// scripts/migrate-demands.js
// Run with: node scripts/migrate-demands.js
// 
// This script fixes existing demands based on ACTUAL SIGNUS data structure:
// - Recalculates priorities
// - Fixes geo mapping from raw data
// - Maps correct field names (municipio, not localidad)
// - Handles all fields from real SIGNUS response

const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI = process.env.DATABASE_URL || "mongodb://localhost:27017/volalte";

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calculatePriority(requestedAt, deadlineAt, kg) {
  const planDate = new Date();

  let ageDays = 0;
  if (requestedAt) {
    ageDays = (planDate - requestedAt) / (1000 * 60 * 60 * 24);
    if (ageDays < 0) ageDays = 0;
  }

  let daysToDeadline = 999;
  if (deadlineAt) {
    daysToDeadline = (deadlineAt - planDate) / (1000 * 60 * 60 * 24);
    if (daysToDeadline < 0) daysToDeadline = 0;
  }

  const ageScore = Math.min(ageDays / 30, 1);
  const deadlineScore = 1 - Math.min(daysToDeadline / 30, 1);
  const weightScore = Math.min(kg / 3000, 1);
  const priority = (0.4 * ageScore + 0.4 * deadlineScore + 0.2 * weightScore) * 100;

  return Math.round(priority);
}

async function migrateDemands() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected");

    const Demand = mongoose.model("Demand");

    // Get all demands
    const demands = await Demand.find({});
    console.log(`\n📊 Found ${demands.length} demands to migrate`);

    let updated = 0;
    let errors = 0;

    for (const demand of demands) {
      try {
        const updates = {};
        let needsUpdate = false;

        // PRIORITY: Recalculate if missing or outdated
        if (demand.requestedAt && demand.qtyEstimatedKg != null) {
          const newPriority = calculatePriority(
            demand.requestedAt,
            demand.deadlineAt,
            demand.qtyEstimatedKg
          );
          
          if (demand.priority !== newPriority) {
            updates.priority = newPriority;
            needsUpdate = true;
            console.log(`  ✓ Updated priority for ${demand.signusId}: ${demand.priority} → ${newPriority}`);
          }
        }

        // FIX GEO: Check if geo exists, if not try to populate from old fields or raw
        if (!demand.geo || !demand.geo.lat || !demand.geo.lng) {
          let lat = null;
          let lng = null;

          // Try to get from old flat fields (if they existed)
          if (demand.latitud && demand.longitud) {
            lat = demand.latitud;
            lng = demand.longitud;
          }
          // Or from raw data
          else if (demand.raw && demand.raw.latitud && demand.raw.longitud) {
            lat = demand.raw.latitud;
            lng = demand.raw.longitud;
          }

          if (lat && lng) {
            updates["geo.lat"] = lat;
            updates["geo.lng"] = lng;
            needsUpdate = true;
            console.log(`  ✓ Fixed geo for ${demand.signusId}: (${lat}, ${lng})`);
          }
        }

        // FIX QTY: Map kgSolicitadosEstimados to qtyEstimatedKg
        if (demand.qtyEstimatedKg == null) {
          let kg = null;

          // Try old field name
          if (demand.kgSolicitadosEstimados != null) {
            kg = demand.kgSolicitadosEstimados;
          }
          // Or from raw
          else if (demand.raw && demand.raw.kgSolicitadosEstimados != null) {
            kg = demand.raw.kgSolicitadosEstimados;
          }

          if (kg != null) {
            updates.qtyEstimatedKg = kg;
            needsUpdate = true;
            console.log(`  ✓ Mapped qtyEstimatedKg for ${demand.signusId}: ${kg}kg`);
          }
        }

        // FIX UNITS: Map unidadesSolicitadas to unitsEstimated
        if (demand.unitsEstimated == null && demand.raw && demand.raw.unidadesSolicitadas != null) {
          updates.unitsEstimated = demand.raw.unidadesSolicitadas;
          needsUpdate = true;
          console.log(`  ✓ Mapped unitsEstimated for ${demand.signusId}: ${demand.raw.unidadesSolicitadas}`);
        }

        // FIX GARAGE INFO
        if (!demand.garageId && demand.raw && demand.raw.codigoPgnu) {
          updates.garageId = demand.raw.codigoPgnu;
          needsUpdate = true;
          console.log(`  ✓ Mapped garageId for ${demand.signusId}: ${demand.raw.codigoPgnu}`);
        }

        if (!demand.garageName && demand.raw && demand.raw.nombrePgnu) {
          updates.garageName = demand.raw.nombrePgnu;
          needsUpdate = true;
          console.log(`  ✓ Mapped garageName for ${demand.signusId}: ${demand.raw.nombrePgnu}`);
        }

        // FIX CONTACT
        if ((!demand.contact || !demand.contact.phone) && demand.raw && demand.raw.telefonoPgnu) {
          updates["contact.phone"] = demand.raw.telefonoPgnu;
          needsUpdate = true;
          console.log(`  ✓ Fixed contact phone for ${demand.signusId}`);
        }

        // FIX ADDRESS: Use municipio (NOT localidad which doesn't exist)
        if (demand.raw) {
          if (!demand.address || !demand.address.street) {
            if (demand.raw.direccion) {
              updates["address.street"] = demand.raw.direccion;
              needsUpdate = true;
            }
            if (demand.raw.codigoPostal) {
              updates["address.postalCode"] = demand.raw.codigoPostal;
              needsUpdate = true;
            }
            // FIX: Use municipio for city (NO localidad!)
            if (demand.raw.municipio) {
              updates["address.city"] = demand.raw.municipio;
              updates["address.municipality"] = demand.raw.municipio;
              needsUpdate = true;
            }
            if (demand.raw.provincia) {
              updates["address.province"] = demand.raw.provincia;
              needsUpdate = true;
            }
            if (demand.raw.comunidad) {
              updates["address.region"] = demand.raw.comunidad;
              needsUpdate = true;
            }
            if (demand.raw.pais) {
              updates["address.country"] = demand.raw.pais;
              needsUpdate = true;
            }

            if (needsUpdate) {
              console.log(`  ✓ Fixed address for ${demand.signusId}`);
            }
          }
        }

        // FIX DATES
        if (!demand.requestedAt && demand.raw && demand.raw.fechaPeticion) {
          updates.requestedAt = parseDate(demand.raw.fechaPeticion);
          needsUpdate = true;
        }

        if (!demand.deadlineAt && demand.raw && demand.raw.fechaMaxima) {
          updates.deadlineAt = parseDate(demand.raw.fechaMaxima);
          needsUpdate = true;
        }

        if (!demand.actualCollectionAt && demand.raw && demand.raw.fechaRealRecogida) {
          updates.actualCollectionAt = parseDate(demand.raw.fechaRealRecogida);
          needsUpdate = true;
        }

        // FIX NOTES
        if (!demand.notes && demand.raw && demand.raw.observacionesPeticion) {
          updates.notes = demand.raw.observacionesPeticion;
          needsUpdate = true;
        }

        // Apply updates if any
        if (needsUpdate && Object.keys(updates).length > 0) {
          await Demand.updateOne({ _id: demand._id }, { $set: updates });
          updated++;
          console.log(`  ✅ Updated demand ${demand.signusId}`);
        }
      } catch (err) {
        console.error(`  ❌ Error migrating demand ${demand.signusId}:`, err.message);
        errors++;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log(`✅ Migration complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Unchanged: ${demands.length - updated - errors}`);

    // Show sample of migrated data
    if (updated > 0) {
      console.log("\n📋 Sample migrated demand:");
      const sample = await Demand.findOne({ priority: { $exists: true } });
      if (sample) {
        console.log({
          signusId: sample.signusId,
          garage: sample.garageName,
          city: sample.address?.city,
          kg: sample.qtyEstimatedKg,
          priority: sample.priority,
          geo: sample.geo,
        });
      }
    }

    await mongoose.connection.close();
    console.log("\n🔌 Disconnected from MongoDB");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
}

migrateDemands();