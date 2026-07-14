import { useEffect, useMemo, useState } from "react";
import api, { errMessage } from "../lib/api";
import { PageHeader, Spinner, EmptyState, Modal } from "../components/ui";
import MapView from "../components/MapView";
import PlanBoard from "../components/PlanBoard";
import { usePlan } from "../store/plan";
import { useAuth } from "../store/auth";
import { useToast } from "../store/toast";
import { addDaysISO, routeColor } from "../lib/format";
import { t } from "../i18n/es";

export default function Planning() {
  const { settings } = useAuth();
  const toast = useToast();
  const { plan, routes, unassigned, depot, validation, setPlan, clear, saveRoutes, hasOverCapacity } = usePlan();

  const [drivers, setDrivers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [date, setDate] = useState(addDaysISO(1));
  const [busy, setBusy] = useState(false);
  const [engineDown, setEngineDown] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    api.get("/drivers").then((r) => {
      const active = r.data.filter((d) => d.active && d.vehicle);
      setDrivers(active);
      setSelected(active.map((d) => d._id));
    });
    return () => clear();
  }, []);

  const optimize = async (algorithm) => {
    setBusy(true);
    setEngineDown(false);
    try {
      const body = { date, driverIds: selected };
      if (algorithm === "greedy") body.options = { algorithm: "greedy" };
      const res = await api.post("/plans/optimize", body);
      setPlan(res.data.plan, settings);
      toast.success(`Plan generado: ${res.data.plan.routes.length} rutas`);
    } catch (e) {
      if (e.response?.data?.code === "ENGINE_UNREACHABLE") {
        setEngineDown(true);
        toast.error(t("planning.engineDown"));
      } else {
        toast.error(errMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const doPublish = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      await saveRoutes();
      const res = await api.post(`/plans/${plan._id}/publish`);
      toast.success(t("planning.published", { n: res.data.published }));
      clear();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    try {
      await api.post(`/plans/${plan._id}/discard`);
      clear();
      toast.info("Plan descartado");
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  const toggleDriver = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Map polylines + markers from current (edited) routes
  const { points, mapRoutes } = useMemo(() => {
    const points = [];
    const mapRoutes = [];
    routes.forEach((r, i) => {
      const color = routeColor(i);
      const coords = [];
      if (depot) coords.push([depot.lat, depot.lng]);
      r.stops.forEach((s, j) => {
        if (s.geo?.lat && s.geo?.lng) {
          points.push({ lat: s.geo.lat, lng: s.geo.lng, color, seq: j + 1, popup: `${r.driverName} · ${s.garageName}` });
          coords.push([s.geo.lat, s.geo.lng]);
        }
      });
      if (depot && coords.length > 1) coords.push([depot.lat, depot.lng]);
      if (coords.length > 1) mapRoutes.push({ color, coords });
    });
    return { points, mapRoutes };
  }, [routes, depot]);

  const urgentUnassigned = unassigned.filter((s) => (s.daysToDeadline ?? 99) <= (settings?.urgencyThresholdDays ?? 2)).length;
  const over = hasOverCapacity();

  return (
    <div>
      <PageHeader title={t("planning.title")} subtitle={t("planning.subtitle")} />

      {/* Controls */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">{t("planning.date")}</label>
            <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[240px]">
            <label className="label">{t("planning.drivers")} ({selected.length})</label>
            <div className="flex flex-wrap gap-2">
              {drivers.map((d) => (
                <button
                  key={d._id}
                  onClick={() => toggleDriver(d._id)}
                  className={`chip ${selected.includes(d._id) ? "!bg-accent/10 !text-accent" : ""}`}
                >
                  {d.name} · {d.vehicle?.plate}
                </button>
              ))}
              {!drivers.length && <span className="text-sm text-ink-400">No hay conductores con vehículo.</span>}
            </div>
          </div>
          <button className="btn-accent" onClick={() => optimize()} disabled={busy || !selected.length}>
            {busy ? <Spinner /> : null}
            {busy ? t("planning.optimizing") : t("planning.optimize")}
          </button>
        </div>

        {engineDown && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 flex items-center justify-between gap-3">
            <span>{t("planning.engineDown")}</span>
            <button className="btn-ghost !py-1.5" onClick={() => optimize("greedy")}>{t("planning.useGreedy")}</button>
          </div>
        )}
      </div>

      {!plan ? (
        <EmptyState title={t("planning.noPlan")} />
      ) : (
        <>
          {/* Status bar */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {plan.algorithm === "greedy-fallback" && (
              <span className="badge bg-amber-100 text-amber-700">{t("planning.greedyLabel")}</span>
            )}
            <span className="chip">{routes.length} {t("planning.tours").toLowerCase()}</span>
            <span className="chip">{unassigned.length} {t("planning.unassigned").toLowerCase()}</span>
            {urgentUnassigned > 0 && (
              <span className="badge bg-red-100 text-red-700">{t("planning.urgentUnassigned", { n: urgentUnassigned })}</span>
            )}
            <span className="text-xs text-ink-400 hidden md:inline">· {t("planning.dragHint")}</span>
            <div className="flex-1" />
            <button className="btn-ghost" onClick={discard}>{t("planning.discard")}</button>
            <button
              className="btn-accent"
              onClick={() => setConfirmOpen(true)}
              disabled={over || busy}
              title={over ? t("planning.overCapacity") : ""}
            >
              {t("planning.publish")}
            </button>
          </div>

          <div className="grid xl:grid-cols-2 gap-4">
            <div className="order-2 xl:order-1">
              <PlanBoard colorFor={routeColor} />
            </div>
            <div className="order-1 xl:order-2 card p-3 h-[520px]">
              <MapView points={points} routes={mapRoutes} depot={depot} numbered height={494} />
            </div>
          </div>
        </>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("planning.publish")}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</button>
            <button className="btn-accent" onClick={doPublish}>{t("common.confirm")}</button>
          </>
        }
      >
        <p className="text-sm text-ink-600">{t("planning.confirmPublish")}</p>
      </Modal>
    </div>
  );
}
