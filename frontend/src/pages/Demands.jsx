import { useEffect, useMemo, useState } from "react";
import api, { errMessage } from "../lib/api";
import { PageHeader, StatusBadge, UrgencyBadge, TableSkeleton, EmptyState, Spinner } from "../components/ui";
import MapView from "../components/MapView";
import { useToast } from "../store/toast";
import { useAuth } from "../store/auth";
import { fmtKg, fmtDate } from "../lib/format";
import { t } from "../i18n/es";

export default function Demands() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("table");
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState({ estadoCod: "", province: "", urgentOnly: false });

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit: 500, sortBy: "deadlineAt", sortDir: "asc" };
      if (filters.estadoCod) params.estadoCod = filters.estadoCod;
      if (filters.province) params.province = filters.province;
      if (filters.urgentOnly) params.urgentOnly = true;
      const res = await api.get("/demands", { params });
      setData(res.data);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [filters]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await api.post("/demands/sync");
      toast.success(`Sincronización SIGNUS: ${res.data.summary.total} demandas`);
      await load();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const canSync = ["admin", "dispatcher"].includes(user?.role);
  const items = data?.items || [];
  const threshold = data?.urgencyThresholdDays ?? 2;

  const provinces = useMemo(
    () => [...new Set(items.map((d) => d.address?.province).filter(Boolean))].sort(),
    [data]
  );

  const lastSync = data?.lastSync;
  const syncLabel = lastSync?.at
    ? `${t("demands.lastSync")}: ${new Date(lastSync.at).toLocaleString("es-ES")}`
    : `${t("demands.lastSync")}: ${t("demands.never")}`;

  const points = items
    .filter((d) => d.geo?.lat && d.geo?.lng)
    .map((d) => ({
      lat: d.geo.lat,
      lng: d.geo.lng,
      color: d.daysToDeadline <= threshold ? "#dc2626" : "#2563eb",
      popup: `${d.garageName} · ${fmtKg(d.kg)} · ${Math.round(d.daysToDeadline)}d`,
    }));

  return (
    <div>
      <PageHeader
        title={t("demands.title")}
        subtitle={t("demands.subtitle")}
        actions={
          <>
            <div className="flex rounded-lg border border-ink-300 overflow-hidden">
              <button className={`px-3 py-2 text-sm ${view === "table" ? "bg-accent text-accent-fg" : "bg-white text-ink-600"}`} onClick={() => setView("table")}>{t("demands.tableView")}</button>
              <button className={`px-3 py-2 text-sm ${view === "map" ? "bg-accent text-accent-fg" : "bg-white text-ink-600"}`} onClick={() => setView("map")}>{t("demands.mapView")}</button>
            </div>
            {canSync && (
              <button className="btn-accent" onClick={sync} disabled={syncing}>
                {syncing ? <Spinner /> : null}
                {syncing ? t("demands.syncing") : t("demands.syncNow")}
              </button>
            )}
          </>
        }
      />

      {/* Sync banner + filters */}
      <div className="card p-3 mb-4 flex flex-wrap items-center gap-3">
        <span className="chip">{syncLabel}</span>
        <div className="flex-1" />
        <select className="input w-auto" value={filters.estadoCod} onChange={(e) => setFilters((f) => ({ ...f, estadoCod: e.target.value }))}>
          <option value="">{t("demands.filterState")}: {t("common.all")}</option>
          <option value="EN_CURSO">{t("status.EN_CURSO")}</option>
          <option value="ASIGNADA">{t("status.ASIGNADA")}</option>
          <option value="EN_TRANSITO">{t("status.EN_TRANSITO")}</option>
        </select>
        <select className="input w-auto" value={filters.province} onChange={(e) => setFilters((f) => ({ ...f, province: e.target.value }))}>
          <option value="">{t("demands.filterProvince")}: {t("common.all")}</option>
          {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-600 cursor-pointer">
          <input type="checkbox" checked={filters.urgentOnly} onChange={(e) => setFilters((f) => ({ ...f, urgentOnly: e.target.checked }))} />
          {t("demands.onlyUrgent")}
        </label>
      </div>

      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : view === "map" ? (
        <div className="card p-3">
          {points.length ? <MapView points={points} height={520} /> : <EmptyState title={t("common.empty")} />}
          <div className="flex gap-4 mt-3 text-xs text-ink-500 px-1">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-red-600 inline-block" /> {t("demands.urgent")}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-blue-600 inline-block" /> {t("demands.normal")}</span>
          </div>
        </div>
      ) : items.length ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-ink-100/50">
                <tr>
                  <th className="th">{t("demands.garage")}</th>
                  <th className="th">{t("demands.location")}</th>
                  <th className="th text-right">{t("demands.kg")}</th>
                  <th className="th">{t("demands.deadline")}</th>
                  <th className="th">{t("demands.urgency")}</th>
                  <th className="th">{t("demands.state")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d._id} className="hover:bg-ink-100/40">
                    <td className="td font-medium text-ink-800">
                      {d.garageName}
                      <div className="text-xs text-ink-400 font-normal">{d.garageId}</div>
                    </td>
                    <td className="td">{d.address?.city || "—"}<div className="text-xs text-ink-400">{d.address?.province}</div></td>
                    <td className="td text-right font-medium">{fmtKg(d.kg)}</td>
                    <td className="td">{fmtDate(d.deadlineAt)}</td>
                    <td className="td"><UrgencyBadge days={d.daysToDeadline} threshold={threshold} /></td>
                    <td className="td"><StatusBadge status={d.estadoCod} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-xs text-ink-400 border-t border-ink-100">{items.length} demandas</div>
        </div>
      ) : (
        <EmptyState title={t("common.empty")} hint="No hay demandas que coincidan con los filtros. Prueba a sincronizar SIGNUS." />
      )}
    </div>
  );
}
