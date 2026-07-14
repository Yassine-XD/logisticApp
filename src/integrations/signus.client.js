// src/integrations/signus.client.js
// THE single SIGNUS client. Supports two modes (settings.signus.mode / SIGNUS_MODE):
//   • "mock" — returns the anonymized fixture, with dates materialized relative
//              to "now" so the demo never goes stale.
//   • "live" — hits the real SIGNUS REST API with basic auth + timeouts.
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const { log } = require("../utils/logger");

let Settings = null; // lazy require to avoid model/circular init issues in scripts

async function resolveSignusConfig() {
  // Prefer runtime Settings; fall back to env config.
  try {
    if (!Settings) Settings = require("../models/Settings");
    if (Settings.db && Settings.db.readyState === 1) {
      const s = await Settings.getSettings();
      return {
        mode: s.signus?.mode || config.SIGNUS_MODE,
        user: s.signus?.user || config.SIGNUS_USER,
        pass: s.signus?.pass || config.SIGNUS_PASS,
        baseUrl: s.signus?.baseUrl || config.SIGNUS_BASE_URL,
        crcCode: s.crcCode || config.SIGNUS_CRC_CODE,
      };
    }
  } catch (_) {
    /* fall through to env */
  }
  return {
    mode: config.SIGNUS_MODE,
    user: config.SIGNUS_USER,
    pass: config.SIGNUS_PASS,
    baseUrl: config.SIGNUS_BASE_URL,
    crcCode: config.SIGNUS_CRC_CODE,
  };
}

function dateMinusMonths(months) {
  const t = new Date();
  t.setMonth(t.getMonth() - months);
  return t.toISOString().slice(0, 10);
}

function dayOffsetToDate(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

// ── Mock ────────────────────────────────────────────────────────────────
let _fixtureCache = null;
function loadFixture() {
  if (_fixtureCache) return _fixtureCache;
  const p = path.join(__dirname, "..", "fixtures", "demo-demands.json");
  _fixtureCache = JSON.parse(fs.readFileSync(p, "utf8"));
  return _fixtureCache;
}

function buildMockResponse() {
  const fixture = loadFixture();
  const now = new Date();
  const data = (fixture.data || []).map((rec) => {
    const requested = dayOffsetToDate(rec._requestedDayOffset ?? -7);
    const deadline = dayOffsetToDate(rec._deadlineDayOffset ?? 14);
    deadline.setHours(23, 59, 59, 0); // deadline at end of day
    const { _requestedDayOffset, _deadlineDayOffset, ...rest } = rec;
    return {
      ...rest,
      fechaPeticion: requested.toISOString().slice(0, 19),
      fechaMaxima: deadline.toISOString().slice(0, 19),
      fechaRealRecogida: null,
    };
  });
  log(
    `SIGNUS[mock]: returning ${data.length} demo demands (anchored to ${now
      .toISOString()
      .slice(0, 10)})`
  );
  return { msgCodigo: 0, msgDescripcion: "OK (mock)", data };
}

// ── Live ────────────────────────────────────────────────────────────────
async function fetchLive(cfg) {
  if (!cfg.user || !cfg.pass) {
    throw new Error("SIGNUS credentials not configured (SIGNUS_USER, SIGNUS_PASS)");
  }
  const peticionDesde = dateMinusMonths(config.SIGNUS_LOOKBACK_MONTHS);
  log(`SIGNUS[live]: fetching albRecs since ${peticionDesde}...`);

  try {
    const res = await axios.get(`${cfg.baseUrl}/albRecs`, {
      auth: { username: cfg.user, password: cfg.pass },
      params: {
        crcCod: cfg.crcCode,
        estado: ["EN_CURSO", "ASIGNADA", "EN_TRANSITO"],
        peticionDesde,
      },
      timeout: 30000,
    });
    if (!res.data) throw new Error("SIGNUS returned empty response");
    if (res.data.msgCodigo && res.data.msgCodigo !== 0) {
      throw new Error(`SIGNUS API error: ${res.data.msgDescripcion || "unknown"}`);
    }
    log(`SIGNUS[live]: ${res.data.data?.length || 0} records`);
    return res.data;
  } catch (err) {
    if (err.response) {
      throw new Error(
        `SIGNUS API error: ${err.response.status} ${err.response.statusText}`
      );
    }
    if (err.request) throw new Error("SIGNUS API timeout or network error");
    throw err;
  }
}

/**
 * Fetch raw albRecs (SIGNUS-native shape: { msgCodigo, data: [...] }).
 * Honors the current mode (mock|live).
 */
async function fetchAlbRecsRaw() {
  const cfg = await resolveSignusConfig();
  if (cfg.mode === "live") return fetchLive(cfg);
  return buildMockResponse();
}

/**
 * Post a completed collection back to SIGNUS.
 * In mock mode this is a no-op stub (SIGNUS write-back is out of demo scope).
 */
async function postCollectionComplete(albaranData) {
  const cfg = await resolveSignusConfig();
  if (cfg.mode !== "live") {
    log(
      `SIGNUS[mock]: (stub) would post collection complete for ${albaranData?.codigo}`
    );
    return { ok: true, stub: true };
  }
  try {
    const res = await axios.post(
      `${cfg.baseUrl}/albRecs/${albaranData.codigo}/complete`,
      {
        fechaRealRecogida: albaranData.fechaRealRecogida,
        kgReales: albaranData.kgReales,
        observaciones: albaranData.observaciones,
      },
      { auth: { username: cfg.user, password: cfg.pass }, timeout: 15000 }
    );
    return res.data;
  } catch (err) {
    log.error(`SIGNUS write-back failed: ${err.message}`);
    throw err;
  }
}

module.exports = { fetchAlbRecsRaw, postCollectionComplete, resolveSignusConfig };
