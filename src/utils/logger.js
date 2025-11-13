const util = require("util");

const levels = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG",
};

function format(level, ...args) {
  const ts = new Date().toISOString();
  return `[${ts}] [${levels[level]}] ${args
    .map((a) => (typeof a === "string" ? a : util.inspect(a)))
    .join(" ")}`;
}

module.exports = {
  info: (...a) => console.log(format("info", ...a)),
  warn: (...a) => console.warn(format("warn", ...a)),
  error: (...a) => console.error(format("error", ...a)),
  debug: (...a) => console.debug(format("debug", ...a)),
};
