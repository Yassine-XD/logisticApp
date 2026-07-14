// components/ui.jsx — small reusable UI primitives.
import { useEffect } from "react";
import { t } from "../i18n/es";

export function Spinner({ className = "" }) {
  return (
    <svg className={`animate-spin ${className}`} width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLES = {
  COMPLETED: "bg-emerald-100 text-emerald-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  NOT_READY: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-ink-100 text-ink-600",
  PLANNED: "bg-indigo-100 text-indigo-700",
  CANCELED: "bg-red-100 text-red-700",
  NEW: "bg-ink-100 text-ink-600",
  EN_CURSO: "bg-blue-100 text-blue-700",
  ASIGNADA: "bg-indigo-100 text-indigo-700",
  EN_TRANSITO: "bg-cyan-100 text-cyan-700",
};

export function StatusBadge({ status }) {
  return (
    <span className={`badge ${STATUS_STYLES[status] || "bg-ink-100 text-ink-600"}`}>
      {t(`status.${status}`) || status}
    </span>
  );
}

export function UrgencyBadge({ days, threshold = 2 }) {
  const urgent = days != null && days <= threshold;
  return (
    <span
      className={`badge ${urgent ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
      title={days != null ? `${days} días para el plazo` : ""}
    >
      {urgent ? "● " : ""}
      {days != null ? `${Math.max(0, Math.round(days))} d` : "—"}
    </span>
  );
}

export function CapacityBar({ used, total, showLabel = true }) {
  const pct = total ? Math.round((used / total) * 100) : 0;
  const over = pct > 100;
  const color = over ? "bg-red-500" : pct >= 80 ? "bg-emerald-500" : "bg-amber-500";
  return (
    <div>
      {showLabel && (
        <div className="flex justify-between text-xs mb-1">
          <span className="text-ink-500">{used?.toLocaleString("es-ES")} / {total?.toLocaleString("es-ES")} kg</span>
          <span className={`font-semibold ${over ? "text-red-600" : "text-ink-700"}`}>{pct}%</span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-ink-100 overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

export function KpiCard({ label, value, sub, tone = "default", icon }) {
  const tones = {
    default: "text-ink-900",
    accent: "text-accent",
    danger: "text-red-600",
    success: "text-emerald-600",
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</span>
        {icon && <span className="text-ink-300">{icon}</span>}
      </div>
      <div className={`mt-2 text-3xl font-bold ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-ink-100 flex items-center justify-center text-ink-400 text-xl">◎</div>
      <p className="font-semibold text-ink-700">{title}</p>
      {hint && <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="card overflow-hidden">
      <div className="p-3 space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-3">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="skeleton h-5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative card shadow-pop w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <h3 className="font-semibold text-ink-900">{title}</h3>
          <button className="text-ink-400 hover:text-ink-700 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 py-4 border-t border-ink-100 bg-ink-100/40">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
