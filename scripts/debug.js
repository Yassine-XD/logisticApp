// scripts/debug-demands.js
// Run with: node scripts/debug-demands.js
//
// This script helps diagnose why tour requests fail

const mongoose = require("mongoose");
require("dotenv").config();

const Demand = require("../src/models/Demand");

const MONGO_URI =
  process.env.DATABASE_URL || "mongodb://localhost:27017/volalte";

async function debugDemands() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected\n");

    console.log("=".repeat(60));
    console.log("DEMAND STATUS ANALYSIS");
    console.log("=".repeat(60));

    // 1. Total demands
    const totalDemands = await Demand.countDocuments({});
    console.log(`\n📊 Total demands in DB: ${totalDemands}`);

    if (totalDemands === 0) {
      console.log("\n❌ NO DEMANDS FOUND!");
      console.log(
        "   Run the sync job or restart the server to fetch from SIGNUS"
      );
      await mongoose.connection.close();
      return;
    }

    // 2. Check status distribution
    console.log("\n📋 Status Distribution:");
    const statuses = await Demand.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    statuses.forEach((s) => {
      console.log(`   ${s._id || "NULL"}: ${s.count}`);
    });

    // 3. Check estadoCod distribution
    console.log("\n📋 SIGNUS Status (estadoCod) Distribution:");
    const estadoCods = await Demand.aggregate([
      {
        $group: {
          _id: "$estadoCod",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    estadoCods.forEach((s) => {
      console.log(`   ${s._id || "NULL"}: ${s.count}`);
    });

    // 4. Check what tour request query would find
    console.log("\n🔍 Checking Tour Request Query:");
    console.log("   Looking for demands with:");
    console.log("   - status: NEW or CONFIRMED");
    console.log("   - NOT assigned to a driver");
    console.log("   - HAS geo.lat and geo.lng");

    const eligibleDemands = await Demand.find({
      status: { $in: ["NEW", "CONFIRMED"] },
      "assigned.driverId": { $exists: false },
      "geo.lat": { $exists: true },
      "geo.lng": { $exists: true },
    }).limit(10);

    console.log(`\n✅ Found ${eligibleDemands.length} eligible demands`);

    if (eligibleDemands.length === 0) {
      console.log("\n❌ NO ELIGIBLE DEMANDS FOUND!");
      console.log("\nPossible reasons:");

      // Check each condition
      const hasNewOrConfirmed = await Demand.countDocuments({
        status: { $in: ["NEW", "CONFIRMED"] },
      });
      console.log(
        `   - Demands with status NEW/CONFIRMED: ${hasNewOrConfirmed}`
      );
      if (hasNewOrConfirmed === 0) {
        console.log("     ⚠️  ALL DEMANDS HAVE WRONG STATUS!");
        console.log("     Fix: Change status to 'NEW' or 'CONFIRMED'");
      }

      const notAssigned = await Demand.countDocuments({
        "assigned.driverId": { $exists: false },
      });
      console.log(`   - Demands not assigned: ${notAssigned}`);
      if (notAssigned === 0) {
        console.log("     ⚠️  ALL DEMANDS ARE ALREADY ASSIGNED!");
        console.log("     Fix: Clear assignments");
      }

      const hasGeo = await Demand.countDocuments({
        "geo.lat": { $exists: true },
        "geo.lng": { $exists: true },
      });
      console.log(`   - Demands with coordinates: ${hasGeo}`);
      if (hasGeo === 0) {
        console.log("     ⚠️  NO DEMANDS HAVE COORDINATES!");
        console.log("     Fix: Run migration script");
      }

      // Check combination
      const newWithGeo = await Demand.countDocuments({
        status: { $in: ["NEW", "CONFIRMED"] },
        "geo.lat": { $exists: true },
        "geo.lng": { $exists: true },
      });
      console.log(`   - NEW/CONFIRMED with coordinates: ${newWithGeo}`);

      const newUnassigned = await Demand.countDocuments({
        status: { $in: ["NEW", "CONFIRMED"] },
        "assigned.driverId": { $exists: false },
      });
      console.log(`   - NEW/CONFIRMED not assigned: ${newUnassigned}`);
    } else {
      console.log("\n✅ Sample eligible demands:");
      eligibleDemands.slice(0, 3).forEach((d, i) => {
        console.log(`\n   ${i + 1}. Demand ${d.signusId}:`);
        console.log(`      Garage: ${d.garageName}`);
        console.log(`      Status: ${d.status}`);
        console.log(`      Geo: (${d.geo?.lat}, ${d.geo?.lng})`);
        console.log(`      Kg: ${d.qtyEstimatedKg}`);
        console.log(`      Priority: ${d.priority}`);
        console.log(`      Assigned: ${d.assigned?.driverId ? "YES" : "NO"}`);
      });
    }

    // 5. Suggest fixes
    console.log("\n" + "=".repeat(60));
    console.log("SUGGESTED FIXES:");
    console.log("=".repeat(60));

    if (eligibleDemands.length === 0) {
      console.log("\nTo fix 'No eligible demands' issue:");

      if (hasNewOrConfirmed === 0) {
        console.log("\n1️⃣  Change all demand status to 'NEW':");
        console.log(
          "   mongo volalte --eval 'db.demands.updateMany({}, { $set: { status: \"NEW\" } })'"
        );
        console.log("\n   Or in Node.js:");
        console.log(
          "   await Demand.updateMany({}, { $set: { status: 'NEW' } });"
        );
      }

      if (notAssigned === 0) {
        console.log("\n2️⃣  Clear all assignments:");
        console.log(
          "   mongo volalte --eval 'db.demands.updateMany({}, { $unset: { assigned: \"\" } })'"
        );
        console.log("\n   Or in Node.js:");
        console.log(
          "   await Demand.updateMany({}, { $unset: { assigned: '' } });"
        );
      }

      if (hasGeo === 0) {
        console.log("\n3️⃣  Run migration to fix coordinates:");
        console.log("   node scripts/migrate-demands.js");
      }

      console.log("\n4️⃣  Or do everything at once:");
      console.log("   mongo volalte --eval 'db.demands.updateMany({}, {");
      console.log('     $set: { status: "NEW" },');
      console.log('     $unset: { assigned: "" }');
      console.log("   })'");
    } else {
      console.log("\n✅ Everything looks good!");
      console.log("   Tour request should work now.");
      console.log("\nTest with:");
      console.log(
        "   curl -X POST http://localhost:3000/api/drivers/me/tours/request \\"
      );
      console.log("     -H 'Content-Type: application/json' \\");
      console.log("     -d '{");
      console.log('       "driverId": "YOUR_DRIVER_ID",');
      console.log('       "lat": 41.6506,');
      console.log('       "lng": 1.8366');
      console.log("     }'");
    }

    await mongoose.connection.close();
    console.log("\n🔌 Disconnected from MongoDB");
  } catch (err) {
    console.error("❌ Debug failed:", err);
    process.exit(1);
  }
}

debugDemands();
