# DEPLOY.md — Volalte

Full stack: **mongo · engine (internal) · api · web**. Only `web` is exposed.

## Prerequisites
- Docker + Docker Compose v2
- The two repos side-by-side (compose builds the engine from `../LogisticEngine`):
  ```
  parent/
    logisticApp/       ← run compose here
    LogisticEngine/
  ```

## Fresh VPS — one command
```bash
cd logisticApp
cp .env.example .env          # then edit secrets (see below)
make demo                     # build + start + seed demo data
```
Open **http://SERVER_IP:8090** and log in with `admin@demo.local` / `volalte`
(full cheat-sheet is printed by the seed step).

## Manual steps (equivalent)
```bash
docker compose up -d --build           # mongo, engine, api, web
docker compose exec api node scripts/seed-demo.js   # seed demo data
docker compose ps                      # check health
docker compose logs -f api             # tail logs
```

## Environment (`logisticApp/.env`, read by compose)
Compose interpolates these (all have safe demo defaults):

| Variable | Purpose |
|---|---|
| `ENGINE_API_KEY` | Shared secret between api and engine — **set the same on both** |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing — **change in production** |
| `SIGNUS_MODE` | `mock` (demo) or `live` |
| `SIGNUS_USER`, `SIGNUS_PASS`, `SIGNUS_CRC_CODE` | Only for `live` mode |
| `WEB_ORIGIN` | CORS allow-list for the API (e.g. `https://volalte.example.com`) |
| `WEB_PORT` | Host port for the web UI (default `8090`) |
| `COMPANY_NAME` | Initial white-label name |

`LogisticEngine/.env.example` documents the engine's `ENGINE_API_KEY` and
`ENGINE_CORS_ORIGINS`.

> **Generate real secrets** for production:
> ```bash
> openssl rand -hex 32   # JWT_SECRET / JWT_REFRESH_SECRET / ENGINE_API_KEY
> ```

## Health
- `GET /api/health` → `{ status, db, engine, signusMode }` (Mongo + engine reachability).
- Every service has a Docker `healthcheck`.

## Going to production (SIGNUS live)
1. In **Ajustes** (admin) set SIGNUS mode = *Producción* and enter credentials
   (or set `SIGNUS_MODE=live` + `SIGNUS_USER/PASS/CRC` in `.env`).
2. Set strong `JWT_*` and `ENGINE_API_KEY`.
3. Restrict `WEB_ORIGIN` / `ENGINE_CORS_ORIGINS` to your real domain.

## Optional: HTTPS with Caddy (reverse proxy in front of `web`)
```caddyfile
volalte.example.com {
    reverse_proxy localhost:8090
}
```
Or nginx + certbot:
```bash
# host nginx vhost proxying 443 → http://127.0.0.1:8090, then:
certbot --nginx -d volalte.example.com
```

## Commands cheat-sheet (`make`)
```
make up       # build + start
make demo     # up + seed (one-shot demo)
make seed     # seed demo data
make reseed   # reset tours/plans/demands, then reseed (clean state)
make logs     # tail logs
make ps       # status
make down     # stop
make clean    # stop + wipe volumes (deletes the DB)
make test     # backend jest + engine pytest
```
