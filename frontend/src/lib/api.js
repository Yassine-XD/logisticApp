// lib/api.js — axios instance talking ONLY to the Node API.
// JWT access token in memory + localStorage; auto-refresh on 401 once.
import axios from "axios";

const TOKENS_KEY = "volalte.tokens";

export function loadTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) || "null");
  } catch {
    return null;
  }
}
export function saveTokens(tokens) {
  if (tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(TOKENS_KEY);
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 95000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const tokens = loadTokens();
  if (tokens?.accessToken) {
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

let refreshing = null;
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (status === 401 && !original._retry && !original.url.includes("/auth/")) {
      const tokens = loadTokens();
      if (!tokens?.refreshToken) {
        saveTokens(null);
        onUnauthorized();
        return Promise.reject(error);
      }
      original._retry = true;
      try {
        if (!refreshing) {
          refreshing = axios
            .post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken: tokens.refreshToken })
            .then((r) => r.data)
            .finally(() => {
              refreshing = null;
            });
        }
        const data = await refreshing;
        const next = { ...tokens, accessToken: data.accessToken, refreshToken: data.refreshToken };
        saveTokens(next);
        original.headers.Authorization = `Bearer ${next.accessToken}`;
        return api(original);
      } catch (e) {
        saveTokens(null);
        onUnauthorized();
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  }
);

// Normalize an axios error into a friendly Spanish-ish message
export function errMessage(error, fallback = "Ha ocurrido un error") {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

export default api;
