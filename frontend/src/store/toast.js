// store/toast.js — transient notifications.
import { create } from "zustand";

let idc = 0;
export const useToast = create((set, get) => ({
  toasts: [],
  push(message, type = "info", ttl = 4000) {
    const id = ++idc;
    set({ toasts: [...get().toasts, { id, message, type }] });
    if (ttl) setTimeout(() => get().dismiss(id), ttl);
    return id;
  },
  success(m, ttl) {
    return get().push(m, "success", ttl);
  },
  error(m, ttl = 6000) {
    return get().push(m, "error", ttl);
  },
  info(m, ttl) {
    return get().push(m, "info", ttl);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
