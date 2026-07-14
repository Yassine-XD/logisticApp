# DECISIONS.md — product & architecture decisions

Decisions taken while making Volalte demo-ready. Where the brief was ambiguous,
the most professional default was chosen and recorded here.

## Architecture
- **One web frontend, Node is the only engine caller.** The React SPA talks
  exclusively to the Node API (`/api`). The Node API is the sole server-to-server
  caller of the Python OR-Tools engine, authenticated with a shared `X-API-Key`.
  The engine is stateless, headless, and never exposed to the host.
- **Frontend location:** the seed UI in `LogisticEngine/frontend` was promoted
  and rebuilt into **`logisticApp/frontend/`** (single app, react-router). The old
  engine-frontend is left in place in its repo but is not part of the product.
- **Web serving:** in production a dedicated `web` (nginx) container serves the
  built SPA and reverse-proxies `/api` → `api:3000` (gzip + asset caching). The
  Node API *also* serves `frontend/dist` statically if present, so a single-container
  deploy works too — but compose uses the nginx `web` service (the spec lists it and
  it's the more production-like choice).

## Data model
- **ONE canonical `Demand` schema** with English field names (`kg`, `requestedAt`,
  `deadlineAt`, `geo.{lat,lng}`) plus the SIGNUS-native `estadoCod`/`estado` used by
  planning filters, an internal `status` lifecycle, an `assigned` subdocument, and
  `unitsRequested`. The sync writes exactly this shape; every reader agrees on it.
  The redundant `SignusAlbRec` collection and its two-collection sync were removed.
- **Planning reads, sync writes.** `getPlanningDemands` only READS from Mongo. The
  cron `syncDemands` is the sole writer of SIGNUS-sourced fields and preserves our
  lifecycle (`status` defaults to `NEW` only on insert).

## Optimization / engine
- **Greedy is a labelled fallback only.** The three duplicated greedy planners were
  removed; a single `greedy.service.js` survives strictly as the fallback when the
  engine is unreachable, filling each vehicle to its **own** capacity (never an
  averaged fleet capacity). Plans carry `algorithm: "engine" | "greedy-fallback"`.
- **Urgency threshold unified** to one constant (default **2 days**), overridable per
  request via `urgencyThresholdDays`.
- **Server-authoritative dates.** When `planDate` is supplied, the engine recomputes
  `daysToDeadline`/`ageDays` from `deadlineAt` and ignores client snapshots.
- **Driver daily time budget (default 9h).** Implemented as a **per-slot span cap** on
  the OR-Tools Time dimension: each of a driver's tour slots is capped at
  `budget / maxTours`, so the sum of a driver's tours stays within the daily budget.
  Route timing is anchored to `planDate` at a configurable `workdayStartHour` (08:00).

## Config
- **Nothing operational is hardcoded.** A single `Settings` document (white-label
  name/accent/CRC, depot, SIGNUS creds+mode, tire weights, urgency/capacity/workday
  params, max tours) is seeded from env and editable in **Ajustes**. `config/index.js`
  provides the boot defaults / env fallbacks.

## Demo mode
- **`SIGNUS_MODE=mock|live`** (also in Settings). Mock returns an anonymized fixture
  (`src/fixtures/demo-demands.json`, ~72 demands, ~11 urgent) whose dates are stored
  as day-offsets and **materialized relative to “today”** at read time, so the demo
  never goes stale. The 195 KB real SIGNUS dump (`data.txt`) was deleted and
  git-ignored.

## Persistence / transactions
- **Mongo runs standalone** (no replica set) for a simple single-host demo. Publish
  uses a transaction when a replica set is detected and otherwise falls back to
  sequential writes with best-effort cleanup on failure.

## Security
- All API routes require auth except `/api/health`, `/api/auth/login`,
  `/api/auth/refresh`. Roles: `admin`, `dispatcher`, `driver`. Drivers may only touch
  their own tours (enforced in the controller). helmet, restricted CORS, `/auth`
  rate-limit, and a central error handler (no stack traces to clients) are in place.
  Public self-registration was removed — accounts are admin-created.
