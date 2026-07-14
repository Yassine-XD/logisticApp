import { useEffect, useState } from "react";
import api, { errMessage } from "../lib/api";
import { PageHeader, Modal, Field, TableSkeleton, EmptyState } from "../components/ui";
import { useToast } from "../store/toast";
import { t } from "../i18n/es";

const empty = { email: "", password: "", firstName: "", lastName: "", role: "dispatcher", driverId: "", active: true };

export default function Users() {
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState(null);
  const [pwFor, setPwFor] = useState(null);
  const [newPw, setNewPw] = useState("");

  const load = async () => {
    const [u, d] = await Promise.all([api.get("/users"), api.get("/drivers")]);
    setUsers(u.data.users);
    setDrivers(d.data);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      if (form.id) {
        await api.put(`/users/${form.id}`, {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          role: form.role,
          driverId: form.role === "driver" ? form.driverId : "",
          active: form.active,
        });
      } else {
        await api.post("/users", { ...form, driverId: form.role === "driver" ? form.driverId : undefined });
      }
      toast.success(t("common.save"));
      setForm(null);
      load();
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  const resetPw = async () => {
    try {
      await api.post(`/users/${pwFor.id}/reset-password`, { newPassword: newPw });
      toast.success(t("users.passwordReset"));
      setPwFor(null);
      setNewPw("");
    } catch (e) {
      toast.error(errMessage(e));
    }
  };

  return (
    <div>
      <PageHeader
        title={t("users.title")}
        actions={<button className="btn-accent" onClick={() => setForm({ ...empty })}>+ {t("users.newUser")}</button>}
      />
      {!users ? (
        <TableSkeleton cols={5} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-ink-100/50">
              <tr>
                <th className="th">{t("users.name")}</th>
                <th className="th">{t("users.email")}</th>
                <th className="th">{t("users.role")}</th>
                <th className="th">{t("users.linkedDriver")}</th>
                <th className="th text-center">{t("users.active")}</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-ink-100/40">
                  <td className="td font-medium text-ink-800">{u.firstName} {u.lastName}</td>
                  <td className="td">{u.email}</td>
                  <td className="td"><span className="chip">{t(`roles.${u.role}`)}</span></td>
                  <td className="td">{u.driver?.name || "—"}</td>
                  <td className="td text-center">{u.active ? "✓" : "—"}</td>
                  <td className="td text-right whitespace-nowrap">
                    <button className="text-accent font-medium mr-3" onClick={() => setForm({ ...u, driverId: u.driver?._id || u.driver || "" })}>{t("common.edit")}</button>
                    <button className="text-ink-500 font-medium" onClick={() => setPwFor(u)}>{t("users.resetPassword")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / edit */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t("users.editUser") : t("users.newUser")}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
            <button className="btn-accent" onClick={save}>{t("common.save")}</button>
          </>
        }
      >
        {form && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("users.name")}>
                <input className="input" placeholder="Nombre" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </Field>
              <Field label="Apellidos">
                <input className="input" placeholder="Apellidos" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </Field>
            </div>
            {!form.id && (
              <>
                <Field label={t("users.email")}>
                  <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label={t("users.password")}>
                  <input className="input" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </Field>
              </>
            )}
            <Field label={t("users.role")}>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="admin">{t("roles.admin")}</option>
                <option value="dispatcher">{t("roles.dispatcher")}</option>
                <option value="driver">{t("roles.driver")}</option>
              </select>
            </Field>
            {form.role === "driver" && (
              <Field label={t("users.linkedDriver")}>
                <select className="input" value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                  <option value="">—</option>
                  {drivers.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
              </Field>
            )}
            {form.id && (
              <Field label={t("users.active")}>
                <select className="input" value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
                  <option value="1">{t("common.yes")}</option>
                  <option value="0">{t("common.no")}</option>
                </select>
              </Field>
            )}
          </>
        )}
      </Modal>

      {/* Reset password */}
      <Modal
        open={!!pwFor}
        onClose={() => { setPwFor(null); setNewPw(""); }}
        title={`${t("users.resetPassword")} · ${pwFor?.email || ""}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => { setPwFor(null); setNewPw(""); }}>{t("common.cancel")}</button>
            <button className="btn-accent" onClick={resetPw} disabled={newPw.length < 6}>{t("common.confirm")}</button>
          </>
        }
      >
        <Field label={t("users.newPassword")}>
          <input className="input" type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="mín. 6 caracteres" />
        </Field>
      </Modal>
    </div>
  );
}
