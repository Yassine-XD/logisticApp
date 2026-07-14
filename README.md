# Volalte — tire-collection logistics platform

White-label platform for tire-collection centres (CRCs) working with **SIGNUS**.
It covers the full operational loop:

```
SIGNUS demands → sync to DB → dispatcher plans routes (OR-Tools)
→ review/edit on a map → publish tours → drivers execute on mobile
→ actual kg/tire counts recorded → results on the dashboard
```

This repo is the **Node API + web frontend + deployment stack**. The OR-Tools
solver lives in the sibling repo [`LogisticEngine`](../LogisticEngine).

## Stack
| Part | Tech |
|---|---|
| API | Node 20 · Express · Mongoose · JWT |
| Engine | Python 3.11 · FastAPI · Google OR-Tools (separate repo) |
| Web | Vite · React 18 · react-router · Tailwind · react-leaflet · @dnd-kit |
| DB | MongoDB 7 |
| Deploy | docker-compose (mongo · engine · api · web) |

**Architecture:** the web app talks **only** to the Node API. The Node API is the
sole caller of the Python engine (server-to-server, `X-API-Key`). See `DECISIONS.md`.

## Quick start (Docker — recommended)
```bash
cp .env.example .env      # edit secrets
make demo                 # build + start + seed demo data
# → http://localhost:8090   (admin@demo.local / volalte)
```
Full runbook in **`DEPLOY.md`**, demo script in **`DEMO.md`**.

## Local development (no Docker)
```bash
# 1) Mongo (any local instance) + engine running on :8000 (see LogisticEngine)
# 2) API
npm install
cp .env.example .env
npm run seed:demo         # seed demo data + mock SIGNUS sync
npm run dev               # http://localhost:3001
# 3) Web
cd frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api)
```

## Project layout
```
src/
  config/          env-backed boot config
  models/          Demand (canonical), Plan, Tour, Driver, Vehicle, User, Settings
  integrations/    signus.client.js  (mock|live, single client)
  services/        demands · optimizer (engine connector) · greedy (fallback)
  controllers/     auth · demands · plans · tours · drivers · vehicles · users · dashboard · settings
  routes/          all authenticated except /health, /auth/login, /auth/refresh
  jobs/            sync.job.js (single node-cron)
  middleware/      auth + central error handler
  fixtures/        demo-demands.json (anonymized)
  tests/           jest + supertest (auth, sync mapping, optimizer, publish, tire math)
frontend/          React SPA (all roles, Spanish)
scripts/           seed-demo.js · gen-fixture.js
```

## Key API endpoints (`/api`)
- `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`
- `GET /demands`, `POST /demands/sync`
- `POST /plans/optimize`, `GET /plans/:id`, `PUT /plans/:id/routes`,
  `POST /plans/:id/publish`, `POST /plans/:id/discard`, `POST /plans/validate-edit`
- `GET /tours/active`, `GET /tours/mine`, `POST /tours/:id/start`,
  `POST /tours/:id/stops/:stopId/{complete|partial|not-ready}`
- `GET /dashboard`, `GET /dashboard/kpis`
- `GET/PUT /settings`, `GET/POST/PUT/DELETE /drivers|/vehicles|/users`
- `GET /health` (Mongo + engine status)

## Tests
```bash
npm test                              # backend (jest + supertest)
cd ../LogisticEngine && python3 run_tests.py   # engine (pytest)
```
