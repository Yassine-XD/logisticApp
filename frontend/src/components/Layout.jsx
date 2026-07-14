import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { t } from "../i18n/es";

const IconWrap = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const icons = {
  dashboard: <IconWrap d={<><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>} />,
  demands: <IconWrap d={<><path d="M3 7h18M3 12h18M3 17h18" /></>} />,
  planning: <IconWrap d={<><circle cx="12" cy="10" r="3" /><path d="M12 21c-4-4-7-7.5-7-11a7 7 0 1 1 14 0c0 3.5-3 7-7 11z" /></>} />,
  tours: <IconWrap d={<><path d="M3 12h13l3 4h2" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /><path d="M3 7h10v9" /></>} />,
  drivers: <IconWrap d={<><circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 14 0" /></>} />,
  vehicles: <IconWrap d={<><rect x="1" y="6" width="15" height="10" rx="1" /><path d="M16 9h4l3 3v4h-7" /><circle cx="6" cy="18" r="1.6" /><circle cx="19" cy="18" r="1.6" /></>} />,
  users: <IconWrap d={<><circle cx="9" cy="8" r="3" /><path d="M2 20a7 7 0 0 1 14 0" /><path d="M17 8a3 3 0 0 1 0 6" /></>} />,
  settings: <IconWrap d={<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>} />,
};

const NAV = [
  { to: "/", key: "dashboard", roles: ["admin", "dispatcher"], end: true },
  { to: "/demands", key: "demands", roles: ["admin", "dispatcher"] },
  { to: "/planning", key: "planning", roles: ["admin", "dispatcher"] },
  { to: "/tours", key: "tours", roles: ["admin", "dispatcher"] },
  { to: "/drivers", key: "drivers", roles: ["admin", "dispatcher"] },
  { to: "/vehicles", key: "vehicles", roles: ["admin", "dispatcher"] },
  { to: "/users", key: "users", roles: ["admin"] },
  { to: "/settings", key: "settings", roles: ["admin"] },
];

export default function Layout() {
  const { user, settings, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(user?.role));
  const company = settings?.companyName || t("app.name");

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  const SidebarInner = (
    <>
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-ink-100">
        <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center text-accent-fg font-bold">
          {company.slice(0, 1)}
        </div>
        <div className="leading-tight">
          <div className="font-bold text-ink-900">{company}</div>
          <div className="text-[11px] text-ink-500">{t("app.tagline")}</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-accent/10 text-accent" : "text-ink-600 hover:bg-ink-100"
              }`
            }
          >
            {icons[n.key]}
            {t(`nav.${n.key}`)}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-ink-100">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 rounded-full bg-ink-100 flex items-center justify-center text-sm font-semibold text-ink-600">
            {user?.firstName?.slice(0, 1)}
          </div>
          <div className="flex-1 leading-tight min-w-0">
            <div className="text-sm font-semibold truncate">{user?.firstName} {user?.lastName}</div>
            <div className="text-[11px] text-ink-500">{t(`roles.${user?.role}`)}</div>
          </div>
        </div>
        <button className="btn-ghost w-full mt-1 justify-start text-ink-600" onClick={doLogout}>
          {t("nav.logout")}
        </button>
      </div>
    </>
  );

  return (
    <div className="h-full flex bg-ink-100">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-ink-100">{SidebarInner}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 flex flex-col bg-white">{SidebarInner}</aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-14 bg-white border-b border-ink-100 flex items-center px-4 gap-3">
          <button className="text-ink-700" onClick={() => setOpen(true)} aria-label="Menú">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="font-bold">{company}</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
