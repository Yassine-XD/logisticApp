// End-to-end critical path (greedy fallback, no engine needed):
// auth → optimize → publish → driver start → complete stop math → release demand.
const request = require("supertest");
const app = require("../app");
const User = require("../models/User");
const Driver = require("../models/Driver");
const Vehicle = require("../models/Vehicle");
const Demand = require("../models/Demand");
const Settings = require("../models/Settings");
const { syncDemands } = require("../services/demands.service");

let dispatcherToken;
let driverToken;
let driverId;

beforeAll(async () => {
  await Settings.getSettings({ fresh: true });

  const v1 = await Vehicle.create({ plate: "TEST-1", capacityKg: 8000, active: true });
  const v2 = await Vehicle.create({ plate: "TEST-2", capacityKg: 6000, active: true });
  const d1 = await Driver.create({ name: "Test Uno", vehicle: v1._id, active: true, maxDailyTours: 3 });
  await Driver.create({ name: "Test Dos", vehicle: v2._id, active: true, maxDailyTours: 3 });
  driverId = d1._id;

  await User.create({ email: "disp@test.local", password: "secret1", firstName: "D", lastName: "P", role: "dispatcher" });
  await User.create({ email: "drv@test.local", password: "secret1", firstName: "Dr", lastName: "V", role: "driver", driver: d1._id });

  await syncDemands();
});

it("authenticates a dispatcher", async () => {
  const res = await request(app).post("/api/auth/login").send({ email: "disp@test.local", password: "secret1" });
  expect(res.status).toBe(200);
  expect(res.body.accessToken).toBeTruthy();
  dispatcherToken = res.body.accessToken;
});

it("rejects unauthenticated access to demands", async () => {
  const res = await request(app).get("/api/demands");
  expect(res.status).toBe(401);
});

let planId;
it("creates a DRAFT plan via the greedy fallback", async () => {
  const res = await request(app)
    .post("/api/plans/optimize")
    .set("Authorization", `Bearer ${dispatcherToken}`)
    .send({ date: new Date().toISOString().slice(0, 10), options: { algorithm: "greedy" } });
  expect(res.status).toBe(201);
  expect(res.body.plan.algorithm).toBe("greedy-fallback");
  expect(res.body.plan.routes.length).toBeGreaterThan(0);
  // No route exceeds its own vehicle capacity
  for (const r of res.body.plan.routes) expect(r.totalKg).toBeLessThanOrEqual(r.capacityKg);
  planId = res.body.plan._id;
});

it("publishes the plan into tours and marks demands SCHEDULED", async () => {
  const res = await request(app)
    .post(`/api/plans/${planId}/publish`)
    .set("Authorization", `Bearer ${dispatcherToken}`);
  expect(res.status).toBe(200);
  expect(res.body.published).toBeGreaterThan(0);
  const scheduled = await Demand.countDocuments({ status: "SCHEDULED" });
  expect(scheduled).toBeGreaterThan(0);
});

it("lets the driver log in and see their tours", async () => {
  const login = await request(app).post("/api/auth/login").send({ email: "drv@test.local", password: "secret1" });
  driverToken = login.body.accessToken;
  const res = await request(app)
    .get("/api/tours/mine")
    .set("Authorization", `Bearer ${driverToken}`)
    .query({ date: new Date().toISOString().slice(0, 10) });
  expect(res.status).toBe(200);
  expect(res.body.tours.length).toBeGreaterThan(0);
});

it("computes actual kg from tire counts (50×8.58 + 20×59 = 1609)", async () => {
  const mine = await request(app)
    .get("/api/tours/mine")
    .set("Authorization", `Bearer ${driverToken}`)
    .query({ date: new Date().toISOString().slice(0, 10) });
  const tour = mine.body.tours[0];

  await request(app).post(`/api/tours/${tour._id}/start`).set("Authorization", `Bearer ${driverToken}`);

  const stop = tour.stops[0];
  const res = await request(app)
    .post(`/api/tours/${tour._id}/stops/${stop._id}/complete`)
    .set("Authorization", `Bearer ${driverToken}`)
    .send({ smallTires: 50, mediumTires: 20 });
  expect(res.status).toBe(200);
  expect(res.body.stopSummary.actualKg).toBe(1609);
});

it("releases a demand when a stop is marked NOT_READY", async () => {
  const mine = await request(app)
    .get("/api/tours/mine")
    .set("Authorization", `Bearer ${driverToken}`)
    .query({ date: new Date().toISOString().slice(0, 10) });
  const tour = mine.body.tours[0];
  const pending = tour.stops.find((s) => s.status === "SCHEDULED");
  const res = await request(app)
    .post(`/api/tours/${tour._id}/stops/${pending._id}/not-ready`)
    .set("Authorization", `Bearer ${driverToken}`)
    .send({ reason: "Cerrado" });
  expect(res.status).toBe(200);
  const demand = await Demand.findById(pending.demand);
  expect(demand.status).toBe("NOT_READY");
  expect(demand.assigned?.tourId).toBeFalsy();
});

it("forbids a driver from accessing another driver's tour", async () => {
  // dispatcher publishes belongs to driver1; create a second driver user
  const other = await User.create({ email: "drv2@test.local", password: "secret1", firstName: "O", lastName: "T", role: "driver", driver: (await Driver.findOne({ name: "Test Dos" }))._id });
  const login = await request(app).post("/api/auth/login").send({ email: "drv2@test.local", password: "secret1" });
  const mine = await request(app)
    .get("/api/tours/mine")
    .set("Authorization", `Bearer ${dispatcherToken}`); // dispatcher can't use /mine without driverId
  // driver2 tries to fetch a tour belonging to driver1
  const Tour = require("../models/Tour");
  const t1 = await Tour.findOne({ driver: driverId });
  const res = await request(app).get(`/api/tours/${t1._id}`).set("Authorization", `Bearer ${login.body.accessToken}`);
  expect(res.status).toBe(403);
  expect(other).toBeTruthy();
});
