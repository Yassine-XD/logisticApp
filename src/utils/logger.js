// src/utils/logger.js
// Tiny structured logger. Keeps the historical `log(...)` signature working
// while adding level helpers used by the newer modules.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? 2;

function emit(level, args) {
  if (LEVELS[level] > current) return;
  const ts = new Date().toISOString();
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`${ts} [volalte] [${level}]`, ...args);
}

const log = (...args) => emit("info", args);
log.info = (...args) => emit("info", args);
log.warn = (...args) => emit("warn", args);
log.error = (...args) => emit("error", args);
log.debug = (...args) => emit("debug", args);

module.exports = { log };
