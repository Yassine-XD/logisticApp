import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverlay,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { usePlan } from "../store/plan";
import { CapacityBar } from "./ui";
import { fmtKg } from "../lib/format";
import { t } from "../i18n/es";

function StopCard({ stop, color, dragging }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(stop.signusId),
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const urgent = (stop.daysToDeadline ?? 99) <= 2;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-lg border bg-white px-3 py-2 cursor-grab active:cursor-grabbing ${
        urgent ? "border-red-200" : "border-ink-200"
      } ${dragging ? "shadow-pop" : "shadow-sm"}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink-800 truncate">{stop.garageName}</div>
          <div className="text-xs text-ink-500">
            {stop.address?.city || ""} · {fmtKg(stop.plannedKg)}
          </div>
        </div>
        {urgent && <span className="badge bg-red-100 text-red-700 shrink-0">urgente</span>}
      </div>
    </div>
  );
}

function Column({ id, title, subtitle, color, stops, capacityKg, totalKg, pct, over, isUnassigned }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      className={`card p-3 w-72 shrink-0 flex flex-col ${isOver ? "ring-2 ring-accent/40" : ""} ${
        over ? "border-red-300" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {!isUnassigned && <span className="h-3 w-3 rounded-full" style={{ background: color }} />}
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{title}</div>
          {subtitle && <div className="text-xs text-ink-400">{subtitle}</div>}
        </div>
        <span className="ml-auto chip">{stops.length}</span>
      </div>
      {!isUnassigned && (
        <div className="mb-2">
          <CapacityBar used={totalKg} total={capacityKg} />
          {over && <div className="text-xs text-red-600 mt-1 font-medium">{t("planning.overCapacity")}</div>}
        </div>
      )}
      <div ref={setNodeRef} className="flex-1 space-y-2 min-h-[80px] overflow-y-auto pr-0.5">
        <SortableContext items={stops.map((s) => String(s.signusId))} strategy={verticalListSortingStrategy}>
          {stops.map((s) => (
            <StopCard key={s.signusId} stop={s} color={isUnassigned ? "#94a3b8" : color} />
          ))}
        </SortableContext>
        {stops.length === 0 && (
          <div className="text-xs text-ink-400 text-center py-6 border border-dashed border-ink-200 rounded-lg">
            {isUnassigned ? "—" : "Suelta paradas aquí"}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlanBoard({ colorFor }) {
  const { routes, unassigned, findContainer, moveStop, reorderWithin } = usePlan();
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeStop =
    [...routes.flatMap((r) => r.stops), ...unassigned].find((s) => String(s.signusId) === String(activeId)) || null;

  const onDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const from = findContainer(active.id);
    // over.id can be a container id (droppable) or a stop id
    const containers = ["unassigned", ...routes.map((r) => r.routeId)];
    let to = containers.includes(over.id) ? over.id : findContainer(over.id);
    if (!from || !to) return;

    if (from === to) {
      if (String(active.id) !== String(over.id)) reorderWithin(from, active.id, over.id);
      return;
    }
    // cross-container: insert before the over stop, or append if dropped on the column
    let toIndex = null;
    if (!containers.includes(over.id)) {
      const list = to === "unassigned" ? unassigned : routes.find((r) => r.routeId === to).stops;
      toIndex = list.findIndex((s) => String(s.signusId) === String(over.id));
    }
    moveStop(active.id, from, to, toIndex);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {routes.map((r, i) => (
          <Column
            key={r.routeId}
            id={r.routeId}
            color={colorFor(i)}
            title={`${r.driverName} · ${t("planning.tour")} ${(r.tourIndex ?? 0) + 1}`}
            subtitle={`${r.vehiclePlate || ""} · ${r.stops.length} ${t("common.stops")}`}
            stops={r.stops}
            capacityKg={r.capacityKg}
            totalKg={r.totalKg}
            over={r.overCapacity}
          />
        ))}
        <Column
          id="unassigned"
          isUnassigned
          title={t("planning.unassigned")}
          subtitle={`${unassigned.length} ${t("demands.title").toLowerCase()}`}
          stops={unassigned}
        />
      </div>

      <DragOverlay>
        {activeStop ? (
          <div className="rounded-lg border border-accent bg-white px-3 py-2 shadow-pop w-64">
            <div className="text-sm font-medium">{activeStop.garageName}</div>
            <div className="text-xs text-ink-500">{fmtKg(activeStop.plannedKg)}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
