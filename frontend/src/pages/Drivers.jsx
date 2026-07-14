import { useEffect, useState } from "react";
import api, { errMessage } from "../lib/api";
import { PageHeader, Modal, Field, TableSkeleton, EmptyState } from "../components/ui";
import { useToast } from "../store/toast";
import { t } from "../i18n/es";

const empty = { name: "", phone: "", vehicle: "", maxDailyTours: 3, active: true };

export default function Drivers() {
  const toast = useToast();
  const [drivers, setDrivers] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(null);

  const load = async () => {
    const [d, v] = await Promise.all([api.get("/drivers"), api.get("/vehicles")]);
    setDrivers(d.data);
    setVehicles(v.data);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      const body = { ...form, vehicle: form.vehicle || null };
      if (form._id) await api.put(`/drivers/${form._id}`, body);
      else await api.post("/drivers", body);
      toast.success(t("common.save"));
      setForm(null);
      load();
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  const remove = async (d) => {
    if (!confirm(`¿Desactivar a ${d.name}?`)) return;
    try {
      await api.delete(`/drivers/${d._id}`);
      load();
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  return (
    <div>
      <PageHeader
        title={t("drivers.title")}
        actions={<button className="btn-accent" onClick={() => setForm({ ...empty })}>+ {t("drivers.newDriver")}</button>}
      />
      {!drivers ? (
        <TableSkeleton cols={5} />
      ) : drivers.length === 0 ? (
        <EmptyState title={t("common.empty")} action={<button className="btn-accent" onClick={() => setForm({ ...empty })}>+ {t("drivers.newDriver")}</button>} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-ink-100/50">
              <tr>
                <th className="th">{t("drivers.name")}</th>
                <th className="th">{t("drivers.phone")}</th>
                <th className="th">{t("drivers.vehicle")}</th>
                <th className="th text-center">{t("drivers.maxTours")}</th>
                <th className="th text-center">{t("drivers.active")}</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d._id} className="hover:bg-ink-100/40">
                  <td className="td font-medium text-ink-800">{d.name}</td>
                  <td className="td">{d.phone || "—"}</td>
                  <td className="td">{d.vehicle?.plate || <span className="text-ink-400">{t("drivers.noVehicle")}</span>}</td>
                  <td className="td text-center">{d.maxDailyTours ?? 3}</td>
                  <td className="td text-center">{d.active ? "✓" : "—"}</td>
                  <td className="td text-right whitespace-nowrap">
                    <button className="text-accent font-medium mr-3" onClick={() => setForm({ ...d, vehicle: d.vehicle?._id || "" })}>{t("common.edit")}</button>
                    <button className="text-red-600 font-medium" onClick={() => remove(d)}>{t("common.delete")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?._id ? t("drivers.editDriver") : t("drivers.newDriver")}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
            <button className="btn-accent" onClick={save} disabled={!form?.name}>{t("common.save")}</button>
          </>
        }
      >
        {form && (
          <>
            <Field label={t("drivers.name")}>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t("drivers.phone")}>
              <input className="input" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label={t("drivers.vehicle")}>
              <select className="input" value={form.vehicle || ""} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}>
                <option value="">{t("drivers.noVehicle")}</option>
                {vehicles.map((v) => <option key={v._id} value={v._id}>{v.plate} · {v.capacityKg} kg</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("drivers.maxTours")}>
                <input type="number" min="1" max="6" className="input" value={form.maxDailyTours} onChange={(e) => setForm({ ...form, maxDailyTours: Number(e.target.value) })} />
              </Field>
              <Field label={t("drivers.active")}>
                <select className="input" value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
                  <option value="1">{t("common.yes")}</option>
                  <option value="0">{t("common.no")}</option>
                </select>
              </Field>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
