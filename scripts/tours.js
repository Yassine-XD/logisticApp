// scripts/migrate-tours-signus.js
// Add signusId and signusAlbRec to existing tour stops
// Run with: node scripts/migrate-tours-signus.js

const mongoose = require("mongoose");
require("dotenv").config();

const Tour = require("../src/models/Tour");
const Demand = require("../src/models/Demand");

const MONGO_URI = process.env.DATABASE_URL || "mongodb://localhost:27017/volalte";

async function migrateTours() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected\n");

    // Get all tours
    const tours = await Tour.find({});
    console.log(`📊 Found ${tours.length} tours to migrate\n`);

    if (tours.length === 0) {
      console.log("✅ No tours to migrate");
      await mongoose.connection.close();
      return;
    }

    let toursUpdated = 0;
    let stopsUpdated = 0;
    let errors = 0;
    let skipped = 0;

    for (const tour of tours) {
      try {
        let tourModified = false;

        console.log(`\n🔍 Processing tour: ${tour._id}`);

        // Check each stop
        for (const stop of tour.stops) {
          const needsSignusId = !stop.signusId;
          const needsSignusAlbRec = !stop.signusAlbRec;

          // Skip if already has both fields
          if (!needsSignusId && !needsSignusAlbRec) {
            continue;
          }

          // Get demand to fetch SIGNUS fields
          const demand = await Demand.findById(stop.demand).select('signusId signusAlbRec');
          
          if (!demand) {
            console.log(`  ⚠️  Stop ${stop.order} - Demand not found: ${stop.demand}`);
            errors++;
            continue;
          }

          // Add signusId if missing
          if (needsSignusId) {
            if (demand.signusId) {
              stop.signusId = demand.signusId;
              stopsUpdated++;
              tourModified = true;
              console.log(`  ✓ Stop ${stop.order} - Added signusId: ${demand.signusId}`);
            } else {
              console.log(`  ⚠️  Stop ${stop.order} - Demand has no signusId`);
              skipped++;
            }
          }

          // Add signusAlbRec if missing
          if (needsSignusAlbRec) {
            if (demand.signusAlbRec) {
              stop.signusAlbRec = demand.signusAlbRec;
              stopsUpdated++;
              tourModified = true;
              console.log(`  ✓ Stop ${stop.order} - Added signusAlbRec: ${demand.signusAlbRec}`);
            } else {
              // Generate default if SIGNUS doesn't provide it
              const defaultAlbRec = `ALB${demand.signusId}`;
              stop.signusAlbRec = defaultAlbRec;
              stopsUpdated++;
              tourModified = true;
              console.log(`  ✓ Stop ${stop.order} - Generated signusAlbRec: ${defaultAlbRec}`);
            }
          }
        }

        // Save tour if modified
        if (tourModified) {
          await tour.save();
          toursUpdated++;
          console.log(`✅ Tour ${tour._id} saved`);
        } else {
          console.log(`ℹ️  Tour ${tour._id} - No changes needed`);
        }
      } catch (err) {
        console.error(`❌ Error migrating tour ${tour._id}:`, err.message);
        errors++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Migration complete!");
    console.log(`   Tours updated: ${toursUpdated}`);
    console.log(`   Stops updated: ${stopsUpdated}`);
    console.log(`   Stops skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log("=".repeat(60));

    // Verify
    console.log("\n🔍 Verifying migration...");
    
    const withSignusId = await Tour.countDocuments({ 
      "stops.signusId": { $exists: true } 
    });
    const withSignusAlbRec = await Tour.countDocuments({ 
      "stops.signusAlbRec": { $exists: true } 
    });
    
    console.log(`✅ Tours with signusId in stops: ${withSignusId}`);
    console.log(`✅ Tours with signusAlbRec in stops: ${withSignusAlbRec}`);
    
    // Sample tour
    const sampleTour = await Tour.findOne({ 
      "stops.signusId": { $exists: true } 
    }).select("stops._id stops.order stops.signusId stops.signusAlbRec stops.garageName");
    
    if (sampleTour) {
      console.log("\n📋 Sample tour stops:");
      sampleTour.stops.slice(0, 3).forEach(s => {
        console.log({
          order: s.order,
          signusId: s.signusId,
          signusAlbRec: s.signusAlbRec,
          garageName: s.garageName
        });
      });
    }

    await mongoose.connection.close();
    console.log("\n🔌 Disconnected from MongoDB");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
}

migrateTours();