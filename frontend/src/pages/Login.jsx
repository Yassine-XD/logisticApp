import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { errMessage } from "../lib/api";
import { Spinner } from "../components/ui";
import { t } from "../i18n/es";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      navigate(user.role === "driver" ? "/driver" : "/");
    } catch (err) {
      setError(errMessage(err, t("login.error")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex">
      {/* Brand panel */}
      <div className="hidden lg:flex w-1/2 bg-accent text-accent-fg flex-col justify-between p-12 relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-white/15 flex items-center justify-center text-2xl font-black">V</div>
          <span className="text-2xl font-black tracking-tight">Volalte</span>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-black leading-tight">Recogida de neumáticos, planificada al detalle.</h1>
          <p className="mt-4 text-accent-fg/80 text-lg">
            Sincroniza demandas de SIGNUS, optimiza rutas con OR-Tools y ejecuta la recogida — todo en una plataforma.
          </p>
        </div>
        <div className="relative z-10 text-accent-fg/70 text-sm">CRC · SIGNUS · Optimización de flota</div>
        <div className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute right-24 top-16 h-40 w-40 rounded-full bg-white/5" />
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center text-accent-fg font-black">V</div>
            <span className="text-xl font-black">Volalte</span>
          </div>
          <h2 className="text-2xl font-bold text-ink-900">{t("login.title")}</h2>
          <p className="text-sm text-ink-500 mt-1 mb-6">{t("login.subtitle")}</p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 border border-red-100">{error}</div>
          )}

          <label className="label">{t("login.email")}</label>
          <input
            className="input mb-4"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@demo.local"
            required
          />
          <label className="label">{t("login.password")}</label>
          <input
            className="input mb-6"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <button className="btn-accent w-full" disabled={loading}>
            {loading ? <Spinner /> : t("login.submit")}
          </button>
          <p className="text-xs text-ink-400 mt-6 leading-relaxed">{t("login.demoHint")}</p>
        </form>
      </div>
    </div>
  );
}
