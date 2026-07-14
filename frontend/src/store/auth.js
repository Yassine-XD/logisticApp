// store/auth.js — authentication + current settings (white-label).
import { create } from "zustand";
import api, { saveTokens, loadTokens } from "../lib/api";
import { applyAccent } from "../lib/format";

export const useAuth = create((set, get) => ({
  user: null,
  settings: null,
  ready: false,

  async bootstrap() {
    const tokens = loadTokens();
    if (!tokens?.accessToken) {
      set({ ready: true });
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data });
      await get().loadSettings();
    } catch {
      saveTokens(null);
      set({ user: null });
    } finally {
      set({ ready: true });
    }
  },

  async login(email, password) {
    const { data } = await api.post("/auth/login", { email, password });
    saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    set({ user: { ...data.user, id: data.user.id } });
    await get().loadSettings();
    return data.user;
  },

  async loadSettings() {
    try {
      const { data } = await api.get("/settings");
      set({ settings: data.settings });
      applyAccent(data.settings?.accentColor);
      if (data.settings?.companyName) {
        document.title = `${data.settings.companyName} · Logística`;
      }
    } catch {
      /* settings optional */
    }
  },

  setSettings(settings) {
    set({ settings });
    applyAccent(settings?.accentColor);
  },

  async logout() {
    const tokens = loadTokens();
    try {
      if (tokens?.refreshToken) await api.post("/auth/logout", { refreshToken: tokens.refreshToken });
    } catch {
      /* ignore */
    }
    saveTokens(null);
    set({ user: null });
  },
}));
