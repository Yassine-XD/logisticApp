import { useEffect, useState } from "react";
import api from "../lib/api";
import { PageHeader, StatusBadge, EmptyState, Spinner, Modal } from "../components/ui";
import { fmtKg, fmtTime, todayISO } from "../lib/format";
import { t } from "../i18n/es";

function ProgressRing({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="relative h-12 w-12">
      <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="4" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgb(var(--accent))" strokeWidth="4" strokeDasharray={`${pct} 100`} strokeLinecap="round" pathLength="100" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{done}/{total}</span>
    </div>
  );
}

export default function Tours() {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayISO());
  const [detail, setDetail] = useState(null);

  const load = async () => {
    try {
      const res = await api.get("/tours/active", { params: { date } });
      setTours(res.data.tours);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [date]);

  return (
    <div>
      <PageHeader
        title={t("tours.title")}
        subtitle={t("tours.subtitle")}
        actions={<input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />}
      />

      {loading ? (
        <div className="h-40 flex items-center justify-center text-accent"><Spinner className="w-6 h-6" /></div>
      ) : tours.length === 0 ? (
        <EmptyState title={t("tours.noTours")} />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tours.map((tour) => (
            <button key={tour.id} className="card p-4 text-left hover:shadow-pop transition-shadow" onClick={() => setDetail(tour)}>
              <div className="flex items-center gap-3">
                <ProgressRing done={tour.completedStops} total={tour.totalStops} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{tour.driver}</div>
                  <div className="text-xs text-ink-500">{tour.vehicle} · {t("planning.tour")} {(tour.tourIndex ?? 0) + 1}</div>
                </div>
                <StatusBadge status={tour.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-ink-500">{tour.totalStops} {t("common.stops")}</span>
                <span className="text-ink-500">{fmtKg(tour.totalActualKg || 0)} / {fmtKg(tour.totalPlannedKg)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.driver} · ${detail.vehicle}` : ""} wide>
        {detail && (
          <ol className="space-y-2">
            {detail.stops.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-2">
                <span className="h-7 w-7 rounded-full bg-ink-100 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.name}</div>
                  <div className="text-xs text-ink-500 truncate">{s.address}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm">{s.actualKg != null ? fmtKg(s.actualKg) : fmtKg(s.kg)}</div>
                  {s.completedAt && <div className="text-[11px] text-ink-400">{fmtTime(s.completedAt)}</div>}
                </div>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </div>
  );
}
