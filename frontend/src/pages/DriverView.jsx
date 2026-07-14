import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { errMessage } from "../lib/api";
import { useAuth } from "../store/auth";
import { useToast } from "../store/toast";
import { Spinner, StatusBadge, Modal, Field } from "../components/ui";
import { fmtKg, todayISO } from "../lib/format";
import { t } from "../i18n/es";

function StopActionSheet({ stop, kind, onClose, onSubmit }) {
  const [small, setSmall] = useState(0);
  const [medium, setMedium] = useState(0);
  const [reason, setReason] = useState("");
  const isNotReady = kind === "notReady";
  return (
    <Modal
      open
      onClose={onClose}
      title={`${isNotReady ? t("driverView.notReady") : kind === "partial" ? t("driverView.partial") : t("driverView.complete")} · ${stop.garageName}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn-accent" onClick={() => onSubmit({ smallTires: Number(small), mediumTires: Number(medium), reason })}>
            {t("driverView.confirm")}
          </button>
        </>
      }
    >
      {isNotReady ? (
        <Field label={t("driverView.reason")}>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("driverView.reasonPlaceholder")} />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("driverView.smallTires")}>
            <input type="number" min="0" inputMode="numeric" className="input text-lg" value={small} onChange={(e) => setSmall(e.target.value)} />
          </Field>
          <Field label={t("driverView.mediumTires")}>
            <input type="number" min="0" inputMode="numeric" className="input text-lg" value={medium} onChange={(e) => setMedium(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

export default function DriverView() {
  const { user, settings, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [tours, setTours] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [sheet, setSheet] = useState(null); // { stop, kind }

  const load = async () => {
    try {
      const res = await api.get("/tours/mine", { params: { date: todayISO() } });
      setTours(res.data.tours);
      setActiveId((cur) => cur || res.data.tours.find((x) => x.status !== "COMPLETED")?._id || res.data.tours[0]?._id);
    } catch (e) {
      toast.error(errMessage(e));
    }
  };
  useEffect(() => {
    load();
  }, []);

  const tour = tours?.find((x) => x._id === activeId);

  const start = async () => {
    try {
      await api.post(`/tours/${tour._id}/start`);
      toast.success(t("driverView.tourStarted"));
      load();
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  const submitStop = async ({ smallTires, mediumTires, reason }) => {
    const { stop, kind } = sheet;
    const path = kind === "notReady" ? "not-ready" : kind === "partial" ? "partial" : "complete";
    try {
      await api.post(`/tours/${tour._id}/stops/${stop._id}/${path}`, kind === "notReady" ? { reason } : { smallTires, mediumTires });
      toast.success(t("driverView.stopDone"));
      setSheet(null);
      load();
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  const company = settings?.companyName || "Volalte";

  return (
    <div className="min-h-full bg-ink-100">
      {/* Top bar */}
      <header className="bg-accent text-accent-fg px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div>
          <div className="text-xs opacity-80">{company}</div>
          <div className="font-bold">{t("driverView.title")}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm opacity-90">{user?.firstName}</span>
          <button className="text-sm underline opacity-90" onClick={doLogout}>{t("nav.logout")}</button>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4">
        {!tours ? (
          <div className="h-40 flex items-center justify-center text-accent"><Spinner className="w-6 h-6" /></div>
        ) : tours.length === 0 ? (
          <div className="card p-8 text-center mt-8">
            <div className="text-4xl mb-2">🚚</div>
            <p className="font-semibold text-ink-700">{t("driverView.noTour")}</p>
          </div>
        ) : (
          <>
            {/* Tour selector when multiple */}
            {tours.length > 1 && (
              <div className="flex gap-2 mb-3 overflow-x-auto">
                {tours.map((x, i) => (
                  <button key={x._id} onClick={() => setActiveId(x._id)} className={`chip whitespace-nowrap ${x._id === activeId ? "!bg-accent !text-accent-fg" : ""}`}>
                    {t("planning.tour")} {i + 1} · {x.stops.filter((s) => ["COMPLETED", "PARTIAL"].includes(s.status)).length}/{x.stops.length}
                  </button>
                ))}
              </div>
            )}

            {/* Progress header */}
            {tour && (
              <>
                <div className="card p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <StatusBadge status={tour.status} />
                    <span className="text-sm text-ink-500">{tour.vehicle || ""} · {fmtKg(tour.totalPlannedKg)}</span>
                  </div>
                  {(() => {
                    const done = tour.stops.filter((s) => ["COMPLETED", "PARTIAL", "NOT_READY"].includes(s.status)).length;
                    const pct = tour.stops.length ? Math.round((done / tour.stops.length) * 100) : 0;
                    return (
                      <>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-semibold">{done} {t("driverView.of")} {tour.stops.length} {t("common.stops")}</span>
                          <span className="text-ink-500">{pct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </>
                    );
                  })()}
                  {tour.status === "PLANNED" && (
                    <button className="btn-accent w-full mt-3" onClick={start}>{t("driverView.startTour")}</button>
                  )}
                </div>

                {/* Stops */}
                <div className="space-y-3">
                  {tour.stops.map((s, i) => {
                    const done = ["COMPLETED", "PARTIAL", "NOT_READY"].includes(s.status);
                    const started = tour.status === "IN_PROGRESS";
                    return (
                      <div key={s._id} className={`card p-4 ${done ? "opacity-70" : ""}`}>
                        <div className="flex items-start gap-3">
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${done ? "bg-emerald-100 text-emerald-700" : "bg-accent/10 text-accent"}`}>{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-ink-800">{s.garageName}</div>
                            <div className="text-sm text-ink-500">{s.address?.street}, {s.address?.city}</div>
                            <div className="text-sm mt-1">
                              <span className="text-ink-500">{t("driverView.estimatedKg")}: </span>
                              <span className="font-medium">{fmtKg(s.plannedKg)}</span>
                              {s.actualKg != null && <span className="text-emerald-600 font-medium"> · {t("driverView.collected")}: {fmtKg(s.actualKg)}</span>}
                            </div>
                          </div>
                          <StatusBadge status={s.status} />
                        </div>

                        <div className="flex flex-wrap gap-2 mt-3">
                          {s.contact?.phone && (
                            <a href={`tel:${s.contact.phone}`} className="btn-ghost !py-1.5 flex-1">{t("driverView.call")}</a>
                          )}
                          {s.geo?.lat && (
                            <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.geo.lat},${s.geo.lng}`} target="_blank" rel="noreferrer" className="btn-ghost !py-1.5 flex-1">{t("driverView.navigate")}</a>
                          )}
                        </div>

                        {started && !done && (
                          <div className="grid grid-cols-3 gap-2 mt-2">
                            <button className="btn-accent !py-2 text-xs" onClick={() => setSheet({ stop: s, kind: "complete" })}>{t("driverView.complete")}</button>
                            <button className="btn-ghost !py-2 text-xs" onClick={() => setSheet({ stop: s, kind: "partial" })}>{t("driverView.partial")}</button>
                            <button className="btn-ghost !py-2 text-xs !text-red-600" onClick={() => setSheet({ stop: s, kind: "notReady" })}>{t("driverView.notReady")}</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {sheet && <StopActionSheet stop={sheet.stop} kind={sheet.kind} onClose={() => setSheet(null)} onSubmit={submitStop} />}
    </div>
  );
}
