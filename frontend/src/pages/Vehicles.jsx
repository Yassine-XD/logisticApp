import { useEffect, useState } from "react";
import api, { errMessage } from "../lib/api";
import { PageHeader, Modal, Field, TableSkeleton, EmptyState } from "../components/ui";
import { useToast } from "../store/toast";
import { fmtKg } from "../lib/format";
import { t } from "../i18n/es";

const empty = { plate: "", alias: "", capacityKg: 3200, type: "truck", active: true };

export default function Vehicles() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);

  const load = async () => setRows((await api.get("/vehicles")).data);
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      if (form._id) await api.put(`/vehicles/${form._id}`, form);
      else await api.post("/vehicles", form);
      toast.success(t("common.save"));
      setForm(null);
      load();
    } catch (e) {
      toast.error(errMessage(e));
    }
  };
  const remove = async (v) => {
    if (!confirm(`¿Desactivar ${v.plate}?`)) return;
    await api.delete(`/vehicles/${v._id}`);
    load();
  };

  return (
    <div>
      <PageHeader
        title={t("vehicles.title")}
        actions={<button className="btn-accent" onClick={() => setForm({ ...empty })}>+ {t("vehicles.newVehicle")}</button>}
      />
      {!rows ? (
        <TableSkeleton cols={5} />
      ) : rows.length === 0 ? (
        <EmptyState title={t("common.empty")} action={<button className="btn-accent" onClick={() => setForm({ ...empty })}>+ {t("vehicles.newVehicle")}</button>} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-ink-100/50">
              <tr>
                <th className="th">{t("vehicles.plate")}</th>
                <th className="th">{t("vehicles.alias")}</th>
                <th className="th text-right">{t("vehicles.capacity")}</th>
                <th className="th">{t("vehicles.type")}</th>
                <th className="th text-center">{t("vehicles.active")}</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v._id} className="hover:bg-ink-100/40">
                  <td className="td font-medium text-ink-800">{v.plate}</td>
                  <td className="td">{v.alias || "—"}</td>
                  <td className="td text-right">{fmtKg(v.capacityKg)}</td>
                  <td className="td">{t(`vehicles.${v.type}`) || v.type}</td>
                  <td className="td text-center">{v.active ? "✓" : "—"}</td>
                  <td className="td text-right whitespace-nowrap">
                    <button className="text-accent font-medium mr-3" onClick={() => setForm({ ...v })}>{t("common.edit")}</button>
                    <button className="text-red-600 font-medium" onClick={() => remove(v)}>{t("common.delete")}</button>
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
        title={form?._id ? t("vehicles.editVehicle") : t("vehicles.newVehicle")}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
            <button className="btn-accent" onClick={save} disabled={!form?.plate || !form?.capacityKg}>{t("common.save")}</button>
          </>
        }
      >
        {form && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("vehicles.plate")}>
                <input className="input" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} />
              </Field>
              <Field label={t("vehicles.alias")}>
                <input className="input" value={form.alias || ""} onChange={(e) => setForm({ ...form, alias: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("vehicles.capacity")}>
                <input type="number" min="200" step="100" className="input" value={form.capacityKg} onChange={(e) => setForm({ ...form, capacityKg: Number(e.target.value) })} />
              </Field>
              <Field label={t("vehicles.type")}>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="truck">{t("vehicles.truck")}</option>
                  <option value="van">{t("vehicles.van")}</option>
                  <option value="other">{t("vehicles.other")}</option>
                </select>
              </Field>
            </div>
            <Field label={t("vehicles.active")}>
              <select className="input" value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
                <option value="1">{t("common.yes")}</option>
                <option value="0">{t("common.no")}</option>
              </select>
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}
