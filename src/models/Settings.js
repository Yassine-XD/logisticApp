// src/models/Settings.js
// Single-document collection holding all white-label + operational parameters.
// Nothing operational should be hardcoded elsewhere — read it from here.
const mongoose = require("mongoose");
const config = require("../config");
const { Schema } = mongoose;

const SettingsSchema = new Schema(
  {
    // Enforce a single document
    key: { type: String, default: "global", unique: true, index: true },

    // ── White-label ──────────────────────────────────────────────
    companyName: { type: String, default: config.COMPANY_NAME },
    accentColor: { type: String, default: config.ACCENT_COLOR },
    crcCode: { type: String, default: config.SIGNUS_CRC_CODE },

    // ── Depot / warehouse ────────────────────────────────────────
    depot: {
      lat: { type: Number, default: config.DEPOT_LAT },
      lng: { type: Number, default: config.DEPOT_LNG },
      address: { type: String, default: "" },
    },

    // ── SIGNUS credentials (write-only from the UI; masked on read) ─
    signus: {
      mode: {
        type: String,
        enum: ["mock", "live"],
        default: config.SIGNUS_MODE === "live" ? "live" : "mock",
      },
      user: { type: String, default: config.SIGNUS_USER || "" },
      pass: { type: String, default: config.SIGNUS_PASS || "" },
      baseUrl: { type: String, default: config.SIGNUS_BASE_URL },
    },

    // ── Fleet / collection parameters ────────────────────────────
    defaultTruckCapacityKg: {
      type: Number,
      default: config.DEFAULT_TRUCK_CAPACITY_KG,
    },
    smallTireKg: { type: Number, default: config.SMALL_TIRE_KG },
    mediumTireKg: { type: Number, default: config.MEDIUM_TIRE_KG },

    // ── Planning parameters ──────────────────────────────────────
    urgencyThresholdDays: {
      type: Number,
      default: config.URGENCY_THRESHOLD_DAYS,
    },
    capacityTargetPct: { type: Number, default: config.CAPACITY_TARGET_PCT },
    workdayStartHour: { type: Number, default: config.WORKDAY_START_HOUR },
    workdayLengthHours: { type: Number, default: config.WORKDAY_LENGTH_HOURS },
    maxToursPerDriver: { type: Number, default: config.MAX_TOURS_PER_DRIVER },
  },
  { timestamps: true }
);

/**
 * Fetch (and lazily create) the single settings document.
 * Cached for a short window to avoid a DB hit on every read.
 */
let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 5000;

SettingsSchema.statics.getSettings = async function ({ fresh = false } = {}) {
  if (!fresh && _cache && Date.now() - _cacheAt < CACHE_MS) return _cache;
  let doc = await this.findOne({ key: "global" });
  if (!doc) doc = await this.create({ key: "global" });
  _cache = doc;
  _cacheAt = Date.now();
  return doc;
};

SettingsSchema.statics.updateSettings = async function (patch) {
  const doc = await this.getSettings({ fresh: true });
  // Deep-ish merge for nested objects
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      doc[k] = { ...(doc[k]?.toObject?.() || doc[k] || {}), ...v };
    } else {
      doc[k] = v;
    }
  }
  await doc.save();
  _cache = doc;
  _cacheAt = Date.now();
  return doc;
};

SettingsSchema.statics.clearCache = function () {
  _cache = null;
  _cacheAt = 0;
};

/** Public view: masks the SIGNUS password. */
SettingsSchema.methods.toPublicJSON = function () {
  const o = this.toObject();
  if (o.signus) {
    o.signus.pass = o.signus.pass ? "••••••••" : "";
    o.signus.hasPass = Boolean(this.signus?.pass);
  }
  return o;
};

module.exports = mongoose.model("Settings", SettingsSchema);
