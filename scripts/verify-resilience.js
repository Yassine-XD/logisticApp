// scripts/verify-resilience.js — verifies white-label + engine-down fallback.
// Run: node scripts/verify-resilience.js   (engine must be STOPPED before running)
const axios = require("axios");
const BASE = process.env.BASE || "http://localhost:8090/api";
const http = axios.create({ baseURL: BASE, timeout: 95000 });
const line = (ok, msg) => console.log(`${ok ? "✓" : "✗"} ${msg}`);
const tomorrow = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10);

(async () => {
  const { data: L } = await http.post("/auth/login", { email: "admin@demo.local", password: "volalte" });
  const h = { Authorization: `Bearer ${L.accessToken}` };

  // 8) White-label rebrand
  const orig = (await http.get("/settings", { headers: h })).data.settings;
  await http.put("/settings", { companyName: "CRC Demo Rebrand", accentColor: "#7c3aed" }, { headers: h });
  const after = (await http.get("/settings", { headers: h })).data.settings;
  line(after.companyName === "CRC Demo Rebrand" && after.accentColor === "#7c3aed",
    `White-label: companyName="${after.companyName}", accent=${after.accentColor}`);
  // restore
  await http.put("/settings", { companyName: orig.companyName, accentColor: orig.accentColor }, { headers: h });

  // 9) Engine-down: optimize should fail with ENGINE_UNREACHABLE + fallback offer
  let engineDown = false;
  try {
    await http.post("/plans/optimize", { date: tomorrow() }, { headers: h });
    line(false, "Motor caído: se esperaba ENGINE_UNREACHABLE (¿el motor sigue arriba?)");
  } catch (e) {
    engineDown = e.response?.data?.code === "ENGINE_UNREACHABLE" && e.response?.data?.fallbackAvailable === true;
    line(engineDown, `Motor caído → ${e.response?.status} ${e.response?.data?.code}, fallbackAvailable=${e.response?.data?.fallbackAvailable}`);
  }

  // Greedy fallback produces a labelled plan
  const g = await http.post("/plans/optimize", { date: tomorrow(), options: { algorithm: "greedy" } }, { headers: h });
  const plan = g.data.plan;
  line(plan.algorithm === "greedy-fallback" && plan.routes.length > 0,
    `Planificador alternativo: algorithm=${plan.algorithm}, ${plan.routes.length} rutas`);
  for (const r of plan.routes) {
    if (r.totalKg > r.capacityKg) { line(false, `Ruta ${r.driverName} excede capacidad`); process.exit(1); }
  }
  line(true, "Fallback respeta la capacidad por vehículo");
  await http.post(`/plans/${plan._id}/discard`, {}, { headers: h });

  console.log("\nRESILIENCE VERIFICATION COMPLETE");
})().catch((e) => {
  console.error("FAILED:", e.response?.status, e.response?.data || e.message);
  process.exit(1);
});
