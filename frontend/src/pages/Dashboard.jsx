import { useEffect, useState } from "react";
import api from "../lib/api";
import { PageHeader, KpiCard, EmptyState, Spinner } from "../components/ui";
import MapView from "../components/MapView";
import { fmtKg, fmtTime, routeColor } from "../lib/format";
import { t } from "../i18n/es";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await api.get("/dashboard");
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title={t("dashboard.title")} />
        <div className="h-64 flex items-center justify-center text-accent"><Spinner className="w-7 h-7" /></div>
      </div>
    );
  }

  const k = data?.kpis || {};
  const points = [];
  const routes = [];
  (data?.tourLocations || []).forEach((tour, i) => {
    const color = routeColor(i);
    const coords = [];
    if (data.depot) coords.push([data.depot.lat, data.depot.lng]);
    tour.stops.forEach((s, j) => {
      points.push({ lat: s.lat, lng: s.lng, color, seq: j + 1, popup: `${tour.driverName} · ${s.name} · ${fmtKg(s.kg)}` });
      coords.push([s.lat, s.lng]);
    });
    if (data.depot && coords.length > 1) coords.push([data.depot.lat, data.depot.lng]);
    if (coords.length > 1) routes.push({ color, coords });
  });

  return (
    <div>
      <PageHeader title={t("dashboard.title")} subtitle={new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard label={t("dashboard.kgToday")} value={fmtKg(k.kgToday)} tone="accent" />
        <KpiCard label={t("dashboard.kgWeek")} value={fmtKg(k.kgWeek)} />
        <KpiCard label={t("dashboard.compliance")} value={`${k.deadlineCompliancePct ?? 0}%`} tone="success" />
        <KpiCard label={t("dashboard.activeTours")} value={k.activeTours ?? 0} />
        <KpiCard label={t("dashboard.urgentBacklog")} value={k.urgentBacklog ?? 0} tone={k.urgentBacklog ? "danger" : "default"} sub={`${k.pendingDemands ?? 0} ${t("demands.title").toLowerCase()} pendientes`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-4">
          <h3 className="font-semibold mb-3">{t("dashboard.mapTitle")}</h3>
          {points.length || data?.depot ? (
            <MapView points={points} routes={routes} depot={data?.depot} numbered height={440} />
          ) : (
            <div className="h-[440px] flex items-center justify-center text-sm text-ink-400">{t("dashboard.noActiveTours")}</div>
          )}
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3">{t("dashboard.activity")}</h3>
          {data?.activity?.length ? (
            <ul className="space-y-3 max-h-[440px] overflow-y-auto">
              {data.activity.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${a.type === "completed" ? "bg-emerald-500" : a.type === "partial" ? "bg-amber-500" : a.type === "not_ready" ? "bg-red-500" : "bg-ink-300"}`} />
                  <div className="text-sm">
                    <span className="font-medium text-ink-800">{a.location}</span>
                    <span className="text-ink-500"> · {a.driver}</span>
                    {a.kg != null && <span className="text-ink-500"> · {fmtKg(a.kg)}</span>}
                    <div className="text-xs text-ink-400">{fmtTime(a.timestamp)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-400 py-8 text-center">{t("dashboard.noActivity")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
