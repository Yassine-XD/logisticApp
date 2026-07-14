// store/plan.js — dispatcher plan editing state (drag-and-drop board).
import { create } from "zustand";
import { arrayMove } from "@dnd-kit/sortable";
import api from "../lib/api";

const clone = (o) => JSON.parse(JSON.stringify(o));

function recalc(route, threshold = 2) {
  const totalKg = route.stops.reduce((s, x) => s + (x.plannedKg || 0), 0);
  const pct = route.capacityKg ? Math.round((totalKg / route.capacityKg) * 1000) / 10 : 0;
  return {
    ...route,
    totalKg,
    capacityUtilizationPercent: pct,
    urgentCount: route.stops.filter((x) => (x.daysToDeadline ?? 99) <= threshold).length,
    overCapacity: totalKg > route.capacityKg,
  };
}

let debounceTimer = null;

export const usePlan = create((set, get) => ({
  plan: null,
  routes: [],
  unassigned: [],
  depot: null,
  threshold: 2,
  validation: null,
  dirty: false,

  setPlan(plan, settings) {
    const threshold = settings?.urgencyThresholdDays ?? 2;
    const depot = settings?.depot || null;
    set({
      plan,
      depot,
      threshold,
      routes: (plan.routes || []).map((r) => recalc(clone(r), threshold)),
      unassigned: clone(plan.unassigned || []),
      validation: null,
      dirty: false,
    });
  },

  clear() {
    set({ plan: null, routes: [], unassigned: [], validation: null, dirty: false });
  },

  findContainer(stopId) {
    const { routes, unassigned } = get();
    if (unassigned.some((s) => String(s.signusId) === String(stopId))) return "unassigned";
    const r = routes.find((rt) => rt.stops.some((s) => String(s.signusId) === String(stopId)));
    return r ? r.routeId : null;
  },

  listOf(containerId) {
    const { routes, unassigned } = get();
    if (containerId === "unassigned") return unassigned;
    return routes.find((r) => r.routeId === containerId)?.stops || [];
  },

  // Move a stop between containers (or reorder within one)
  moveStop(activeId, fromId, toId, toIndex) {
    const state = get();
    const threshold = state.threshold;
    let routes = clone(state.routes);
    let unassigned = clone(state.unassigned);

    const getList = (id) => (id === "unassigned" ? unassigned : routes.find((r) => r.routeId === id)?.stops);
    const from = getList(fromId);
    const idx = from.findIndex((s) => String(s.signusId) === String(activeId));
    if (idx < 0) return;
    const [moved] = from.splice(idx, 1);

    const to = getList(toId);
    const insertAt = toIndex == null || toIndex < 0 ? to.length : toIndex;
    to.splice(insertAt, 0, moved);

    routes = routes.map((r) => recalc(r, threshold));
    set({ routes, unassigned, dirty: true });
    get().validateDebounced();
  },

  reorderWithin(containerId, activeId, overId) {
    const state = get();
    if (containerId === "unassigned") {
      const list = clone(state.unassigned);
      const oldI = list.findIndex((s) => String(s.signusId) === String(activeId));
      const newI = list.findIndex((s) => String(s.signusId) === String(overId));
      set({ unassigned: arrayMove(list, oldI, newI), dirty: true });
      return;
    }
    const routes = clone(state.routes);
    const r = routes.find((x) => x.routeId === containerId);
    const oldI = r.stops.findIndex((s) => String(s.signusId) === String(activeId));
    const newI = r.stops.findIndex((s) => String(s.signusId) === String(overId));
    r.stops = arrayMove(r.stops, oldI, newI);
    set({ routes: routes.map((x) => recalc(x, state.threshold)), dirty: true });
    get().validateDebounced();
  },

  validateDebounced() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => get().validate(), 350);
  },

  async validate() {
    const { routes, unassigned, depot, plan } = get();
    if (!plan) return;
    const body = {
      depotLocation: depot ? { lat: depot.lat, lng: depot.lng } : null,
      routes: routes.map((r) => ({
        routeId: r.routeId,
        vehicleId: String(r.vehicle || r.vehicleId || ""),
        driverName: r.driverName,
        capacityKg: r.capacityKg,
        stops: r.stops.map((s) => ({
          signusId: s.signusId,
          garageId: s.garageId || "",
          garageName: s.garageName || "",
          kg: s.plannedKg || 0,
          geo: { lat: s.geo?.lat, lng: s.geo?.lng },
          daysToDeadline: s.daysToDeadline ?? 14,
          priority: s.priority ?? 0,
        })),
      })),
      unassignedStops: unassigned.map((s) => ({
        signusId: s.signusId,
        garageId: s.garageId || "",
        garageName: s.garageName || "",
        kg: s.plannedKg || 0,
        geo: { lat: s.geo?.lat, lng: s.geo?.lng },
        daysToDeadline: s.daysToDeadline ?? 14,
        priority: s.priority ?? 0,
      })),
    };
    try {
      const { data } = await api.post("/plans/validate-edit", body);
      set({ validation: data });
    } catch {
      /* validation is advisory */
    }
  },

  async saveRoutes() {
    const { plan, routes, unassigned } = get();
    await api.put(`/plans/${plan._id}/routes`, { routes, unassigned });
    set({ dirty: false });
  },

  hasOverCapacity() {
    return get().routes.some((r) => r.overCapacity);
  },
}));
