// test-api.js - Quick API testing script
// Run with: node test-api.js

const axios = require("axios");

const BASE_URL = process.env.API_URL || "http://localhost:3000/api";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

async function testHealthCheck() {
  console.log("\n🔍 Testing Health Check...");
  try {
    const res = await api.get("/health");
    console.log("✅ Health:", res.data);
    return true;
  } catch (err) {
    console.error("❌ Health check failed:", err.message);
    return false;
  }
}

async function testListDemands() {
  console.log("\n🔍 Testing List Demands...");
  try {
    const res = await api.get("/demands", {
      params: {
        estadoCod: "EN_CURSO,ASIGNADA,EN_TRANSITO",
        limit: 5,
      },
    });
    console.log(`✅ Demands: Found ${res.data.total} total, showing ${res.data.items.length}`);
    if (res.data.items.length > 0) {
      const firstDemand = res.data.items[0];
      console.log("   First demand:", {
        id: firstDemand._id,
        garage: firstDemand.garageName,
        kg: firstDemand.qtyEstimatedKg,
        priority: firstDemand.priority,
        geo: firstDemand.geo,
        city: firstDemand.address?.city,
      });

      // Validate critical fields
      if (!firstDemand.geo || !firstDemand.geo.lat || !firstDemand.geo.lng) {
        console.warn("   ⚠️  WARNING: Demand missing geo coordinates!");
      }
      if (firstDemand.priority == null) {
        console.warn("   ⚠️  WARNING: Demand missing priority!");
      }
      if (!firstDemand.qtyEstimatedKg) {
        console.warn("   ⚠️  WARNING: Demand missing qtyEstimatedKg!");
      }
    }
    return true;
  } catch (err) {
    console.error("❌ List demands failed:", err.response?.data || err.message);
    return false;
  }
}

async function testCreateDriver() {
  console.log("\n🔍 Testing Create Driver...");
  try {
    const driverData = {
      name: "Test Driver",
      phone: "666123456",
      signusCode: "TEST01",
      nif: "12345678A",
      active: true,
      maxDailyTours: 3,
      maxStopsPerTour: 8,
    };

    const res = await api.post("/drivers", driverData);
    console.log("✅ Driver created:", {
      id: res.data._id,
      name: res.data.name,
      maxDailyTours: res.data.maxDailyTours,
      maxStopsPerTour: res.data.maxStopsPerTour,
    });
    return res.data._id;
  } catch (err) {
    console.error("❌ Create driver failed:", err.response?.data || err.message);
    return null;
  }
}

async function testRequestTour(driverId) {
  console.log("\n🔍 Testing Request Tour...");
  try {
    const tourRequest = {
      driverId: driverId,
      lat: 41.6506,
      lng: 1.8366,
      date: new Date().toISOString(),
    };

    const res = await api.post("/drivers/me/tours/request", tourRequest);
    
    if (!res.data.tour) {
      console.log(`ℹ️  No tour created: ${res.data.info || 'Unknown reason'}`);
      return null;
    }

    console.log(`✅ Tour ${res.data.reused ? "reused" : "created"}:`, {
      tourId: res.data.tour?._id,
      stops: res.data.tour?.stops?.length || 0,
      totalDistance: res.data.tour?.totalDistanceKm || 0,
      remainingCapacity: res.data.tour?.remainingCapacityKg || 0,
    });

    if (res.data.tour?.stops?.length > 0) {
      console.log("   First stop:", {
        garage: res.data.tour.stops[0].garageName,
        kg: res.data.tour.stops[0].plannedKg,
        priority: res.data.tour.stops[0].priority,
        distance: res.data.tour.stops[0].distanceFromPrevKm + "km",
        geo: res.data.tour.stops[0].geo,
      });

      // Validate stop data
      const firstStop = res.data.tour.stops[0];
      if (!firstStop.geo || !firstStop.geo.lat || !firstStop.geo.lng) {
        console.warn("   ⚠️  WARNING: Stop missing geo coordinates!");
      }
      if (firstStop.distanceFromPrevKm === Infinity || firstStop.distanceFromPrevKm === 0) {
        console.warn("   ⚠️  WARNING: Invalid distance calculation!");
      }
    }

    return res.data.tour?._id;
  } catch (err) {
    console.error("❌ Request tour failed:", err.response?.data || err.message);
    return null;
  }
}

async function testGreedyPlan(driverIds) {
  console.log("\n🔍 Testing Greedy Planning...");
  try {
    const planRequest = {
      date: new Date().toISOString().split("T")[0],
      driverIds: driverIds,
      depot: {
        lat: 41.6506,
        lng: 1.8366,
      },
    };

    const res = await api.post("/plan/greedy", planRequest);
    console.log("✅ Plan created:", {
      drivers: res.data.drivers.length,
      totalDemands: res.data.totalDemands,
      assignedDemands: res.data.assignedDemands,
      unassignedDemands: res.data.unassignedDemands,
      totalDistance: res.data.totalDistance,
    });

    res.data.tours.forEach((tour, idx) => {
      console.log(`   Tour ${idx + 1} (${tour.driverName}):`, {
        stops: tour.totalStops,
        distance: tour.totalDistanceKm + "km",
        remaining: tour.remainingCapacityKg + "kg",
      });
    });

    return true;
  } catch (err) {
    console.error("❌ Greedy plan failed:", err.response?.data || err.message);
    return false;
  }
}

async function runTests() {
  console.log("🚀 Starting API Tests...");
  console.log("=" .repeat(50));
  console.log(`Testing server at: ${BASE_URL}`);

  const healthy = await testHealthCheck();
  if (!healthy) {
    console.error("\n❌ Server not healthy. Aborting tests.");
    console.log("\nMake sure the server is running:");
    console.log("  npm run dev");
    return;
  }

  const hasData = await testListDemands();
  if (!hasData) {
    console.error("\n❌ No demands found or API error.");
    console.log("\nMake sure demands are synced:");
    console.log("  1. Check SIGNUS credentials in .env");
    console.log("  2. Restart server (it syncs on startup)");
    console.log("  3. Or run: node scripts/migrate-demands.js");
    return;
  }

  const driverId = await testCreateDriver();
  if (driverId) {
    const tourId = await testRequestTour(driverId);
    
    if (tourId) {
      console.log("\n✅ Tour successfully created!");
    } else {
      console.log("\n⚠️  Tour creation skipped (might be no eligible demands)");
    }

    await testGreedyPlan([driverId]);
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Tests completed!");
  console.log("\nNext steps:");
  console.log("  1. If you see warnings, run: node scripts/validate-signus-data.js");
  console.log("  2. If validation fails, run: node scripts/migrate-demands.js");
  console.log("  3. Test again with: node test-api.js");
}

// Run tests
runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});