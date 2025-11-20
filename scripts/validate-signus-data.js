// scripts/validate-signus-data.js
// Run with: node scripts/validate-signus-data.js
// 
// This script validates your SIGNUS data against expected structure

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

// FIX: Import the actual Demand model from your models
const Demand = require("../src/models/Demand");

const MONGO_URI = process.env.DATABASE_URL || "mongodb://localhost:27017/volalte";

async function validateData() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected\n");

    // Get all demands
    const demands = await Demand.find({});
    console.log(`📊 Total demands: ${demands.length}\n`);

    if (demands.length === 0) {
      console.log("⚠️  No demands found. Run sync first!");
      await mongoose.connection.close();
      return;
    }

    // Validation checks
    const issues = {
      missingGeo: [],
      missingPriority: [],
      missingQty: [],
      missingGarage: [],
      missingAddress: [],
      missingDates: [],
    };

    demands.forEach((d) => {
      // Check geo
      if (!d.geo || !d.geo.lat || !d.geo.lng) {
        issues.missingGeo.push(d.signusId);
      }

      // Check priority
      if (d.priority == null) {
        issues.missingPriority.push(d.signusId);
      }

      // Check qty
      if (!d.qtyEstimatedKg || d.qtyEstimatedKg <= 0) {
        issues.missingQty.push(d.signusId);
      }

      // Check garage
      if (!d.garageId || !d.garageName) {
        issues.missingGarage.push(d.signusId);
      }

      // Check address
      if (!d.address || !d.address.city) {
        issues.missingAddress.push(d.signusId);
      }

      // Check dates
      if (!d.requestedAt || !d.deadlineAt) {
        issues.missingDates.push(d.signusId);
      }
    });

    // Print report
    console.log("=" .repeat(60));
    console.log("VALIDATION REPORT");
    console.log("=" .repeat(60));

    const printIssue = (label, arr) => {
      if (arr.length > 0) {
        console.log(`\n❌ ${label}: ${arr.length} issues`);
        console.log(`   Example IDs: ${arr.slice(0, 5).join(", ")}`);
      } else {
        console.log(`\n✅ ${label}: All OK`);
      }
    };

    printIssue("Missing Geo Coordinates", issues.missingGeo);
    printIssue("Missing Priority", issues.missingPriority);
    printIssue("Missing/Invalid Quantity", issues.missingQty);
    printIssue("Missing Garage Info", issues.missingGarage);
    printIssue("Missing Address", issues.missingAddress);
    printIssue("Missing Dates", issues.missingDates);

    // Summary
    const totalIssues = Object.values(issues).reduce((sum, arr) => sum + arr.length, 0);
    
    console.log("\n" + "=" .repeat(60));
    if (totalIssues === 0) {
      console.log("🎉 ALL VALIDATIONS PASSED!");
    } else {
      console.log(`⚠️  TOTAL ISSUES: ${totalIssues}`);
      console.log(`\nRun migration to fix: node scripts/migrate-demands.js`);
    }

    // Show sample good record
    console.log("\n" + "=" .repeat(60));
    console.log("SAMPLE VALID DEMAND:");
    console.log("=" .repeat(60));
    
    const validDemand = demands.find(d => 
      d.geo?.lat && 
      d.geo?.lng && 
      d.priority != null && 
      d.qtyEstimatedKg > 0
    );

    if (validDemand) {
      console.log(JSON.stringify({
        signusId: validDemand.signusId,
        estado: validDemand.estado,
        estadoCod: validDemand.estadoCod,
        garage: {
          id: validDemand.garageId,
          name: validDemand.garageName,
        },
        geo: validDemand.geo,
        address: {
          street: validDemand.address?.street,
          city: validDemand.address?.city,
          postalCode: validDemand.address?.postalCode,
        },
        contact: validDemand.contact,
        qtyEstimatedKg: validDemand.qtyEstimatedKg,
        unitsEstimated: validDemand.unitsEstimated,
        priority: validDemand.priority,
        requestedAt: validDemand.requestedAt,
        deadlineAt: validDemand.deadlineAt,
        notes: validDemand.notes,
        status: validDemand.status,
      }, null, 2));
    } else {
      console.log("⚠️  No fully valid demands found");
    }

    // Status breakdown
    console.log("\n" + "=" .repeat(60));
    console.log("STATUS BREAKDOWN:");
    console.log("=" .repeat(60));
    
    const statusCounts = {};
    demands.forEach(d => {
      const key = `${d.estadoCod || 'UNKNOWN'} (${d.estado || 'unknown'})`;
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    });

    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    // Priority distribution
    console.log("\n" + "=" .repeat(60));
    console.log("PRIORITY DISTRIBUTION:");
    console.log("=" .repeat(60));
    
    const priorities = demands
      .filter(d => d.priority != null)
      .map(d => d.priority);
    
    if (priorities.length > 0) {
      const avg = priorities.reduce((a, b) => a + b, 0) / priorities.length;
      const max = Math.max(...priorities);
      const min = Math.min(...priorities);
      
      console.log(`  Average: ${avg.toFixed(1)}`);
      console.log(`  Min: ${min}`);
      console.log(`  Max: ${max}`);
      
      // Priority ranges
      const ranges = {
        'Critical (80-100)': priorities.filter(p => p >= 80).length,
        'High (60-79)': priorities.filter(p => p >= 60 && p < 80).length,
        'Medium (40-59)': priorities.filter(p => p >= 40 && p < 60).length,
        'Low (0-39)': priorities.filter(p => p < 40).length,
      };
      
      console.log("\n  Distribution:");
      Object.entries(ranges).forEach(([range, count]) => {
        console.log(`    ${range}: ${count}`);
      });
    } else {
      console.log("  ⚠️  No priorities calculated");
    }

    await mongoose.connection.close();
    console.log("\n🔌 Disconnected from MongoDB");
  } catch (err) {
    console.error("❌ Validation failed:", err);
    process.exit(1);
  }
}

validateData();