// scripts/verify-demo.js — end-to-end demo verification against a running stack.
// Usage: BASE=http://localhost:8090/api node scripts/verify-demo.js
const axios = require("axios");
const BASE = process.env.BASE || "http://localhost:8090/api";
const http = axios.create({ baseURL: BASE, timeout: 95000 });

const login = async (email) => {
  const { data } = await http.post("/auth/login", { email, password: process.env.DEMO_PASSWORD || "volalte" });
  return { token: data.accessToken, h: { Authorization: `Bearer ${data.accessToken}` } };
};
const tomorrow = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const line = (ok, msg) => console.log(`${ok ? "✓" : "✗"} ${msg}`);

(async () => {
  const TOM = tomorrow();
  const disp = await login("dispatcher@demo.local");

  // 2) dashboard empty tours
  let r = await http.get("/dashboard", { headers: disp.h });
  line(r.data.kpis.activeTours === 0, `Panel: rutas activas=${r.data.kpis.activeTours}, urgentes=${r.data.kpis.urgentBacklog}, pendientes=${r.data.kpis.pendingDemands}`);

  // 3) demands + sync
  r = await http.get("/demands?limit=1", { headers: disp.h });
  line(r.data.total >= 60, `Demandas sincronizadas: ${r.data.total}`);
  r = await http.post("/demands/sync", {}, { headers: disp.h });
  line(r.data.success, `Sincronizar ahora: ${r.data.summary.total} demandas`);

  // 4) engine optimize
  r = await http.post("/plans/optimize", { date: TOM }, { headers: disp.h });
  const plan = r.data.plan;
  const perDriver = {};
  plan.routes.forEach((x) => (perDriver[x.driverName] = (perDriver[x.driverName] || 0) + 1));
  const multiTour = Object.values(perDriver).some((n) => n > 1);
  const inBand = plan.routes.filter((x) => x.capacityUtilizationPercent >= 80 && x.capacityUtilizationPercent <= 100).length;
  line(plan.algorithm === "engine", `Optimizar (motor OR-Tools): ${plan.routes.length} rutas, ${plan.unassigned.length} sin asignar`);
  line(multiTour, `Varias rutas por conductor: ${JSON.stringify(perDriver)}`);
  line(inBand >= plan.routes.length - 1, `Capacidad 80–100%: ${inBand}/${plan.routes.length} rutas`);

  // 5) validate-edit over-capacity
  const r0 = plan.routes[0], r1 = plan.routes[1];
  const toStop = (s) => ({ signusId: s.signusId, garageId: s.garageId || "", garageName: s.garageName || "", kg: s.plannedKg, geo: { lat: s.geo.lat, lng: s.geo.lng }, daysToDeadline: s.daysToDeadline ?? 14, priority: s.priority ?? 0 });
  const editBody = { depotLocation: null, routes: [{ routeId: r0.routeId, vehicleId: String(r0.vehicle || ""), driverName: r0.driverName, capacityKg: r0.capacityKg, stops: [...r0.stops, ...r1.stops].map(toStop) }], unassignedStops: [] };
  r = await http.post("/plans/validate-edit", editBody, { headers: disp.h });
  line(r.data.valid === false && r.data.routes[0].overCapacity, `validate-edit sobrecarga detectada: util=${r.data.routes[0].utilizationPercent}%, valid=${r.data.valid}`);

  // 6) publish
  r = await http.post(`/plans/${plan._id}/publish`, {}, { headers: disp.h });
  line(r.data.published > 0 && r.data.plan.status === "PUBLISHED", `Publicar plan: ${r.data.published} rutas creadas (${r.data.plan.status})`);

  r = await http.get(`/tours/active?date=${TOM}`, { headers: disp.h });
  line(r.data.total > 0, `Rutas activas (tablero): ${r.data.total} en estado PLANIFICADA`);

  // 7) driver flow
  const marc = await login("marc@demo.local");
  const mine = (await http.get(`/tours/mine?date=${TOM}`, { headers: marc.h })).data;
  line(mine.count > 0, `Conductor Marc: ${mine.count} rutas hoy`);
  const tour = mine.tours[0];
  await http.post(`/tours/${tour._id}/start`, {}, { headers: marc.h });
  const comp = await http.post(`/tours/${tour._id}/stops/${tour.stops[0]._id}/complete`, { smallTires: 50, mediumTires: 20 }, { headers: marc.h });
  line(comp.data.stopSummary.actualKg === 1609, `Completar parada (50×8.58 + 20×59) = ${comp.data.stopSummary.actualKg} kg`);
  const releasedStop = tour.stops[1];
  await http.post(`/tours/${tour._id}/stops/${releasedStop._id}/not-ready`, { reason: "cerrado" }, { headers: marc.h });
  const dem = await http.get(`/demands?status=NOT_READY&limit=500`, { headers: disp.h });
  line(dem.data.total >= 1, `No listo → demanda liberada (NOT_READY): ${dem.data.total}`);

  // 8) dashboard reflects kg
  r = await http.get("/dashboard", { headers: disp.h });
  line(r.data.kpis.kgToday >= 1609, `Panel refleja kg recogidos hoy: ${r.data.kpis.kgToday} kg`);
  const kpi = (await http.get("/dashboard/kpis", { headers: disp.h })).data;
  line(kpi.kgCollected >= 1609, `KPIs: kgCollected=${kpi.kgCollected}, cumplimiento=${kpi.deadlineCompliancePct}%`);

  // 9) ownership
  const laura = await login("laura@demo.local");
  try {
    await http.get(`/tours/${tour._id}`, { headers: laura.h });
    line(false, "Aislamiento de conductor (esperaba 403)");
  } catch (e) {
    line(e.response?.status === 403, `Aislamiento de conductor: Laura→ruta de Marc = ${e.response?.status}`);
  }

  console.log("\nVERIFICATION COMPLETE");
})().catch((e) => {
  console.error("FAILED:", e.response?.status, e.response?.data || e.message);
  process.exit(1);
});
