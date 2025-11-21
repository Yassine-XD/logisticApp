// scripts/reset-for-testing.js
// Reset all test data for fresh testing
// Run with: node scripts/reset-for-testing.js

const mongoose = require("mongoose");
require("dotenv").config();

const Tour = require("../src/models/Tour");
const Driver = require("../src/models/Driver");
const Vehicle = require("../src/models/Vehicle");
const Demand = require("../src/models/Demand");

const MONGO_URI = process.env.DATABASE_URL || "mongodb://localhost:27017/volalte";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m"
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function resetForTesting() {
  try {
    log("\n🧹 RESET DATABASE FOR TESTING", colors.cyan);
    log("=".repeat(60), colors.cyan);

    log("\n🔌 Connecting to MongoDB...", colors.yellow);
    await mongoose.connect(MONGO_URI);
    log("✅ Connected", colors.green);

    // Backup counts before deletion
    log("\n📊 Current Database State:", colors.blue);
    const counts = {
      tours: await Tour.countDocuments({}),
      drivers: await Driver.countDocuments({}),
      vehicles: await Vehicle.countDocuments({}),
      demands: await Demand.countDocuments({}),
      scheduledDemands: await Demand.countDocuments({ status: "SCHEDULED" }),
      assignedDemands: await Demand.countDocuments({ "assigned.driverId": { $exists: true } })
    };

    log(`   Tours: ${counts.tours}`, colors.reset);
    log(`   Drivers: ${counts.drivers}`, colors.reset);
    log(`   Vehicles: ${counts.vehicles}`, colors.reset);
    log(`   Demands: ${counts.demands}`, colors.reset);
    log(`   └─ Scheduled: ${counts.scheduledDemands}`, colors.yellow);
    log(`   └─ Assigned: ${counts.assignedDemands}`, colors.yellow);

    // Confirmation
    log("\n⚠️  WARNING: This will:", colors.red);
    log("   1. Delete ALL tours", colors.red);
    log("   2. Delete ALL test drivers (with 'TEST' in name)", colors.red);
    log("   3. Delete ALL test vehicles (with 'TEST' in plate)", colors.red);
    log("   4. Reset ALL demand statuses to NEW", colors.red);
    log("   5. Clear ALL demand assignments", colors.red);

    // Wait for user confirmation (commented out for script usage)
    // Uncomment if you want manual confirmation
    /*
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      readline.question('\nType "yes" to continue: ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes') {
      log('\n❌ Reset cancelled', colors.red);
      await mongoose.connection.close();
      return;
    }
    */

    log("\n🔥 Starting reset...\n", colors.yellow);

    // 1. Delete ALL tours
    log("1️⃣  Deleting tours...", colors.blue);
    const toursResult = await Tour.deleteMany({});
    log(`   ✅ Deleted ${toursResult.deletedCount} tours`, colors.green);

    // 2. Delete test drivers (those with TEST in name or signusCode)
    log("\n2️⃣  Deleting test drivers...", colors.blue);
    const driversResult = await Driver.deleteMany({
      $or: [
        { name: /test/i },
        { signusCode: /test/i }
      ]
    });
    log(`   ✅ Deleted ${driversResult.deletedCount} test drivers`, colors.green);

    // List remaining drivers
    const remainingDrivers = await Driver.find({}).select("name phone");
    if (remainingDrivers.length > 0) {
      log(`   ℹ️  Remaining drivers (${remainingDrivers.length}):`, colors.cyan);
      remainingDrivers.forEach(d => {
        log(`      - ${d.name} (${d.phone || 'no phone'})`, colors.reset);
      });
    }

    // 3. Delete test vehicles (those with TEST in plate)
    log("\n3️⃣  Deleting test vehicles...", colors.blue);
    const vehiclesResult = await Vehicle.deleteMany({
      plate: /test/i
    });
    log(`   ✅ Deleted ${vehiclesResult.deletedCount} test vehicles`, colors.green);

    // List remaining vehicles
    const remainingVehicles = await Vehicle.find({}).select("plate alias");
    if (remainingVehicles.length > 0) {
      log(`   ℹ️  Remaining vehicles (${remainingVehicles.length}):`, colors.cyan);
      remainingVehicles.forEach(v => {
        log(`      - ${v.plate} (${v.alias || 'no alias'})`, colors.reset);
      });
    }

    // 4. Reset demand statuses
    log("\n4️⃣  Resetting demand statuses...", colors.blue);
    const demandStatusResult = await Demand.updateMany(
      { 
        status: { $in: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "PARTIAL", "NOT_READY"] }
      },
      { 
        $set: { status: "NEW" }
      }
    );
    log(`   ✅ Reset ${demandStatusResult.modifiedCount} demand statuses to NEW`, colors.green);

    // 5. Clear demand assignments
    log("\n5️⃣  Clearing demand assignments...", colors.blue);
    const demandAssignResult = await Demand.updateMany(
      { 
        "assigned.driverId": { $exists: true }
      },
      { 
        $unset: { assigned: "" }
      }
    );
    log(`   ✅ Cleared ${demandAssignResult.modifiedCount} demand assignments`, colors.green);

    // 6. Verify demands are ready for testing
    log("\n6️⃣  Verifying demands...", colors.blue);
    const eligibleDemands = await Demand.countDocuments({
      status: { $in: ["NEW", "CONFIRMED"] },
      "assigned.driverId": { $exists: false },
      "geo.lat": { $exists: true },
      "geo.lng": { $exists: true }
    });
    log(`   ✅ ${eligibleDemands} demands ready for tour planning`, colors.green);

    if (eligibleDemands === 0) {
      log(`   ⚠️  WARNING: No eligible demands available!`, colors.red);
      log(`   Run: node scripts/fix-geo-fields.js`, colors.yellow);
    }

    // Final summary
    log("\n" + "=".repeat(60), colors.cyan);
    log("✅ RESET COMPLETE!", colors.green);
    log("=".repeat(60), colors.cyan);

    log("\n📊 Final State:", colors.blue);
    log(`   Tours: 0`, colors.green);
    log(`   Test drivers: 0`, colors.green);
    log(`   Test vehicles: 0`, colors.green);
    log(`   Demands ready for testing: ${eligibleDemands}`, colors.green);

    log("\n🎯 You can now:", colors.cyan);
    log("   1. Create fresh test drivers", colors.reset);
    log("   2. Create fresh test vehicles", colors.reset);
    log("   3. Run Postman tests", colors.reset);
    log("   4. Test tour creation", colors.reset);

    await mongoose.connection.close();
    log("\n🔌 Disconnected from MongoDB\n", colors.yellow);

  } catch (err) {
    log(`\n❌ Reset failed: ${err.message}`, colors.red);
    console.error(err);
    process.exit(1);
  }
}

// Run the reset
resetForTesting();