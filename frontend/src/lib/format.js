// lib/format.js — small formatting helpers.
export function fmtKg(n) {
  if (n == null) return "—";
  return `${Math.round(n).toLocaleString("es-ES")} kg`;
}
export function fmtNum(n, digits = 0) {
  if (n == null) return "—";
  return Number(n).toLocaleString("es-ES", { maximumFractionDigits: digits });
}
export function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
export function fmtDateTime(d) {
  if (!d) return "—";
  return `${fmtDate(d)} ${fmtTime(d)}`;
}
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
export function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
export function relTime(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "justNow";
  return mins;
}
// Consistent color per driver/route index
export const ROUTE_COLORS = [
  "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#0f766e", "#c026d3",
];
export function routeColor(i) {
  return ROUTE_COLORS[i % ROUTE_COLORS.length];
}

// Apply the white-label accent color (hex) to the CSS variable
export function applyAccent(hex) {
  if (!hex) return;
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return;
  document.documentElement.style.setProperty("--accent", `${r} ${g} ${b}`);
  // Choose readable foreground
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  document.documentElement.style.setProperty("--accent-fg", luminance > 0.6 ? "15 23 42" : "255 255 255");
}
