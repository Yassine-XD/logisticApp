import { useEffect, useState } from "react";
import api, { errMessage } from "../lib/api";
import { PageHeader, Field, Spinner } from "../components/ui";
import MapView from "../components/MapView";
import { useAuth } from "../store/auth";
import { useToast } from "../store/toast";
import { applyAccent } from "../lib/format";
import { t } from "../i18n/es";

function Section({ title, children }) {
  return (
    <div className="card p-5">
      <h3 className="font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function Settings() {
  const { setSettings } = useAuth();
  const toast = useToast();
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setS(r.data.settings));
  }, []);

  const up = (patch) => setS((prev) => ({ ...prev, ...patch }));
  const upDepot = (patch) => setS((prev) => ({ ...prev, depot: { ...prev.depot, ...patch } }));
  const upSignus = (patch) => setS((prev) => ({ ...prev, signus: { ...prev.signus, ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        companyName: s.companyName,
        accentColor: s.accentColor,
        crcCode: s.crcCode,
        depot: s.depot,
        signus: { mode: s.signus.mode, user: s.signus.user, ...(s.signus.pass && s.signus.pass !== "••••••••" ? { pass: s.signus.pass } : {}) },
        defaultTruckCapacityKg: s.defaultTruckCapacityKg,
        smallTireKg: s.smallTireKg,
        mediumTireKg: s.mediumTireKg,
        urgencyThresholdDays: s.urgencyThresholdDays,
        capacityTargetPct: s.capacityTargetPct,
        workdayStartHour: s.workdayStartHour,
        workdayLengthHours: s.workdayLengthHours,
        maxToursPerDriver: s.maxToursPerDriver,
      };
      const res = await api.put("/settings", body);
      setS(res.data.settings);
      setSettings(res.data.settings);
      toast.success(t("settings.saved"));
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (!s) return <div className="h-40 flex items-center justify-center text-accent"><Spinner className="w-6 h-6" /></div>;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={t("settings.title")}
        actions={<button className="btn-accent" onClick={save} disabled={saving}>{saving ? <Spinner /> : null}{t("common.save")}</button>}
      />

      <div className="grid gap-4">
        <Section title={t("settings.branding")}>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label={t("settings.companyName")}>
              <input className="input" value={s.companyName} onChange={(e) => up({ companyName: e.target.value })} />
            </Field>
            <Field label={t("settings.accentColor")}>
              <div className="flex gap-2 items-center">
                <input type="color" className="h-9 w-12 rounded border border-ink-300" value={s.accentColor} onChange={(e) => { up({ accentColor: e.target.value }); applyAccent(e.target.value); }} />
                <input className="input" value={s.accentColor} onChange={(e) => { up({ accentColor: e.target.value }); applyAccent(e.target.value); }} />
              </div>
            </Field>
            <Field label={t("settings.crcCode")}>
              <input className="input" value={s.crcCode} onChange={(e) => up({ crcCode: e.target.value })} />
            </Field>
          </div>
        </Section>

        <Section title={t("settings.depot")}>
          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <Field label={t("settings.depotLat")}>
              <input type="number" step="0.0001" className="input" value={s.depot.lat} onChange={(e) => upDepot({ lat: Number(e.target.value) })} />
            </Field>
            <Field label={t("settings.depotLng")}>
              <input type="number" step="0.0001" className="input" value={s.depot.lng} onChange={(e) => upDepot({ lng: Number(e.target.value) })} />
            </Field>
            <Field label={t("settings.depotAddress")}>
              <input className="input" value={s.depot.address || ""} onChange={(e) => upDepot({ address: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-ink-400 mb-2">{t("settings.mapHint")}</p>
          <MapView depot={s.depot} onPick={(ll) => upDepot(ll)} height={280} />
        </Section>

        <Section title={t("settings.signus")}>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label={t("settings.mode")}>
              <select className="input" value={s.signus.mode} onChange={(e) => upSignus({ mode: e.target.value })}>
                <option value="mock">{t("settings.modeMock")}</option>
                <option value="live">{t("settings.modeLive")}</option>
              </select>
            </Field>
            <Field label={t("settings.signusUser")}>
              <input className="input" value={s.signus.user || ""} onChange={(e) => upSignus({ user: e.target.value })} autoComplete="off" />
            </Field>
            <Field label={t("settings.signusPass")}>
              <input className="input" type="password" placeholder={s.signus.hasPass ? "••••••••" : ""} value={s.signus.pass === "••••••••" ? "" : (s.signus.pass || "")} onChange={(e) => upSignus({ pass: e.target.value })} autoComplete="new-password" />
            </Field>
          </div>
        </Section>

        <Section title={t("settings.fleet")}>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label={t("settings.truckCapacity")}>
              <input type="number" className="input" value={s.defaultTruckCapacityKg} onChange={(e) => up({ defaultTruckCapacityKg: Number(e.target.value) })} />
            </Field>
            <Field label={t("settings.smallTire")}>
              <input type="number" step="0.01" className="input" value={s.smallTireKg} onChange={(e) => up({ smallTireKg: Number(e.target.value) })} />
            </Field>
            <Field label={t("settings.mediumTire")}>
              <input type="number" step="0.01" className="input" value={s.mediumTireKg} onChange={(e) => up({ mediumTireKg: Number(e.target.value) })} />
            </Field>
          </div>
        </Section>

        <Section title={t("settings.planningParams")}>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label={t("settings.urgencyDays")}>
              <input type="number" step="0.5" className="input" value={s.urgencyThresholdDays} onChange={(e) => up({ urgencyThresholdDays: Number(e.target.value) })} />
            </Field>
            <Field label={t("settings.capacityTarget")}>
              <input type="number" className="input" value={s.capacityTargetPct} onChange={(e) => up({ capacityTargetPct: Number(e.target.value) })} />
            </Field>
            <Field label={t("settings.maxTours")}>
              <input type="number" className="input" value={s.maxToursPerDriver} onChange={(e) => up({ maxToursPerDriver: Number(e.target.value) })} />
            </Field>
            <Field label={t("settings.workdayStart")}>
              <input type="number" min="0" max="23" className="input" value={s.workdayStartHour} onChange={(e) => up({ workdayStartHour: Number(e.target.value) })} />
            </Field>
            <Field label={t("settings.workdayLength")}>
              <input type="number" step="0.5" className="input" value={s.workdayLengthHours} onChange={(e) => up({ workdayLengthHours: Number(e.target.value) })} />
            </Field>
          </div>
        </Section>
      </div>
    </div>
  );
}
