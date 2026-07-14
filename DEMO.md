# DEMO.md — Volalte demo script

A 5-minute walkthrough for a prospective CRC client. Everything below runs on
**mock** SIGNUS data — no real credentials required.

## 0. Start
```bash
cd logisticApp
cp .env.example .env
make demo          # build + start + seed
```
Wait for `Volalte demo is ready → http://localhost:8090`.

**Login cheat-sheet** (all passwords `volalte`):
| Role | Email |
|---|---|
| Administrador | `admin@demo.local` |
| Despachador | `dispatcher@demo.local` |
| Conductor | `marc@demo.local` · `laura@demo.local` · `jordi@demo.local` · `nuria@demo.local` |

## 1. Login as dispatcher → Panel
- KPI cards: kg recogidos hoy/semana, cumplimiento de plazos, rutas activas,
  demandas urgentes pendientes.
- Empty "rutas activas" map (nothing published yet).

## 2. Demandas
- Table of ~72 synced demands; urgent ones (≤2 días) flagged red.
- Toggle **Mapa** → demands plotted around Barcelona/Bages (red = urgent).
- **Sincronizar ahora** re-runs the mock SIGNUS sync; the "última sincronización"
  banner updates.

## 3. Planificación (the money screen)
- Pick **tomorrow** + the 4 drivers → **Optimizar rutas**.
- A draft plan appears: multiple tours per driver, capacity bars at **80–100 %**,
  the map shows colour-coded route polylines with numbered stops and the depot.
- **Drag a stop** from one route to another → the target capacity bar updates live;
  if it goes over capacity it turns red and **Publicar plan** is disabled.
- Drag it back → **Publicar plan** → confirm → tours are created.

## 4. Rutas
- The published tours appear as **PLANIFICADA**, with per-tour progress rings.

## 5. Driver (phone view)
- Open a private window, resize to phone width, log in as `marc@demo.local`.
- **Mi ruta de hoy**: ordered stops with address/phone/kg + call & navigate buttons.
- **Iniciar ruta** → **Completar** a stop (e.g. 50 pequeños + 20 medianos → 1 609 kg)
  → progress updates. Mark another **No listo** → that demand is released and shows
  again in *Demandas* as unassigned.

## 6. Panel reflects reality
- Back as dispatcher, the dashboard KPIs now show the collected kg + activity feed.

## 7. White-label (Ajustes, admin)
- Change **Nombre de la empresa** and **Color de acento** → save → reload: the sidebar,
  buttons and accents re-brand instantly.

## 8. Engine-down resilience
```bash
docker compose stop engine
```
- In **Planificación**, *Optimizar* shows a clear error and offers
  **Usar planificador alternativo**. The fallback produces a plan labelled
  *"Planificador alternativo (motor no disponible)"*.
```bash
docker compose start engine
```
- Optimizing again uses the real OR-Tools engine.

---

## Verified (docker-compose, clean state)

Recorded run of the acceptance checklist against the full stack
(`mongo · engine · api · web`), driving the API exactly as the UI does. Reproduce
with `node scripts/verify-demo.js` (happy path) and `node scripts/verify-resilience.js`
(with the engine stopped).

```
✓ 1. make demo → mongo/engine/api/web all "healthy"
✓ 2. Panel: rutas activas=0, urgentes=9, pendientes=72
✓ 3. Demandas sincronizadas: 72   ·   Sincronizar ahora: 72
✓ 4. Optimizar (OR-Tools): 10 rutas, varias por conductor
       {Marc:3, Laura:3, Jordi:2, Nuria:2}, capacidad 80–100% en 10/10
✓ 4. validate-edit sobrecarga detectada: util=197.4%, valid=false (bloquea publicar)
✓ 4. Publicar plan: 10 rutas creadas (PUBLISHED)
✓ 5. Rutas activas (tablero): 10 en estado PLANIFICADA
✓ 6. Conductor Marc: 3 rutas → iniciar → completar 50×8.58+20×59 = 1609 kg
✓ 6. No listo → demanda liberada (NOT_READY)
✓ 7. Panel refleja kg recogidos hoy: 1609 kg  ·  cumplimiento=100%
✓ 8. White-label: companyName + accent actualizados y aplicados
✓ 9. Motor caído → 502 ENGINE_UNREACHABLE, fallbackAvailable=true
✓ 9. Planificador alternativo: algorithm=greedy-fallback, respeta capacidad/vehículo
✓ 9. Motor reiniciado → engine "reachable"
✓ +  Aislamiento de conductor: Laura→ruta de Marc = 403
✓ 10. Tests: backend jest (12) + engine pytest (10) verdes
```

> Note: the demo plans for **tomorrow** but collects **today**; the dashboard keys
> "kg recogidos hoy" off the actual collection time (`completedAt`), so the KPI
> lights up immediately after the driver records a stop.
