// scripts/seed-demo.js
// Idempotent demo seed. Safe to re-run.
//   • Settings (company "Volalte Demo", depot = Manresa)
//   • 1 admin, 1 dispatcher, 4 drivers (each with a linked User account)
//   • 4 vehicles (3200–8000 kg), one per driver
//   • runs a mock SIGNUS sync
//   • prints a login cheat-sheet
require("dotenv").config({ path: process.env.ENV_PATH || "./.env" });
const mongoose = require("mongoose");
const config = require("../src/config");
const Settings = require("../src/models/Settings");
const User = require("../src/models/User");
const Driver = require("../src/models/Driver");
const Vehicle = require("../src/models/Vehicle");
const { syncDemands } = require("../src/services/demands.service");

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "volalte";

const VEHICLES = [
  { plate: "1234-BVL", alias: "Camión Grande 1", capacityKg: 8000, type: "truck" },
  { plate: "5678-CVL", alias: "Camión Grande 2", capacityKg: 6000, type: "truck" },
  { plate: "9012-DVL", alias: "Camión Medio", capacityKg: 4500, type: "truck" },
  { plate: "3456-EVL", alias: "Furgón", capacityKg: 3200, type: "van" },
];

const DRIVERS = [
  { name: "Marc Puig", phone: "600111222", email: "marc@demo.local", maxDailyTours: 3 },
  { name: "Laura Vidal", phone: "600333444", email: "laura@demo.local", maxDailyTours: 3 },
  { name: "Jordi Serra", phone: "600555666", email: "jordi@demo.local", maxDailyTours: 2 },
  { name: "Nuria Camps", phone: "600777888", email: "nuria@demo.local", maxDailyTours: 2 },
];

async function upsertUser({ email, firstName, lastName, role, phone, driverId }) {
  let user = await User.findOne({ email });
  if (!user) {
    user = new User({ email, firstName, lastName, role, phone });
  }
  user.firstName = firstName;
  user.lastName = lastName;
  user.role = role;
  user.phone = phone;
  user.active = true;
  if (driverId) user.driver = driverId;
  user.password = DEMO_PASSWORD; // re-hashed by pre-save hook
  user.refreshTokens = [];
  await user.save();
  return user;
}

async function run() {
  await mongoose.connect(config.MONGO_URI);
  console.log(`Connected to ${config.MONGO_URI}`);

  // ── Settings ──────────────────────────────────────────────
  await Settings.updateSettings({
    companyName: "Volalte Demo",
    accentColor: "#0f766e",
    crcCode: "R0805",
    depot: { lat: 41.723, lng: 1.8266, address: "C/ dels Blanquers 13, Manresa" },
    signus: { mode: "mock" },
  });
  console.log("✓ Settings (Volalte Demo, depot = Manresa 41.723, 1.8266)");

  // ── Vehicles ──────────────────────────────────────────────
  const vehicleDocs = [];
  for (const v of VEHICLES) {
    const doc = await Vehicle.findOneAndUpdate(
      { plate: v.plate },
      { $set: { ...v, active: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    vehicleDocs.push(doc);
  }
  console.log(`✓ ${vehicleDocs.length} vehicles`);

  // ── Drivers + linked user accounts ────────────────────────
  const cheat = [];
  for (let i = 0; i < DRIVERS.length; i++) {
    const d = DRIVERS[i];
    const vehicle = vehicleDocs[i];
    const driver = await Driver.findOneAndUpdate(
      { name: d.name },
      {
        $set: {
          name: d.name,
          phone: d.phone,
          vehicle: vehicle._id,
          active: true,
          maxDailyTours: d.maxDailyTours,
          homeBase: { lat: 41.723, lng: 1.8266, address: "Depósito Manresa" },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const [firstName, ...rest] = d.name.split(" ");
    await upsertUser({
      email: d.email,
      firstName,
      lastName: rest.join(" ") || "Conductor",
      role: "driver",
      phone: d.phone,
      driverId: driver._id,
    });
    cheat.push({ role: "driver", email: d.email, name: d.name, vehicle: vehicle.plate });
  }
  console.log(`✓ ${DRIVERS.length} drivers (+ linked accounts)`);

  // ── Admin + dispatcher ────────────────────────────────────
  await upsertUser({
    email: "admin@demo.local",
    firstName: "Admin",
    lastName: "Volalte",
    role: "admin",
    phone: "600000001",
  });
  await upsertUser({
    email: "dispatcher@demo.local",
    firstName: "Sara",
    lastName: "Despacho",
    role: "dispatcher",
    phone: "600000002",
  });
  cheat.unshift({ role: "dispatcher", email: "dispatcher@demo.local", name: "Sara Despacho" });
  cheat.unshift({ role: "admin", email: "admin@demo.local", name: "Admin Volalte" });

  // ── Mock SIGNUS sync ──────────────────────────────────────
  const sync = await syncDemands();
  console.log(`✓ Mock SIGNUS sync: ${sync.total} demands (created ${sync.created}, updated ${sync.updated})`);

  // ── Cheat sheet ───────────────────────────────────────────
  console.log("\n────────────────────────────────────────────────");
  console.log("  VOLALTE DEMO — LOGIN CHEAT SHEET");
  console.log("────────────────────────────────────────────────");
  console.log(`  Password for ALL accounts:  ${DEMO_PASSWORD}\n`);
  for (const c of cheat) {
    console.log(`  [${c.role.padEnd(10)}] ${c.email.padEnd(26)} ${c.name}${c.vehicle ? "  · " + c.vehicle : ""}`);
  }
  console.log("────────────────────────────────────────────────\n");

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
