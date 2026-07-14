// src/middleware/error.middleware.js
const { log } = require("../utils/logger");
const config = require("../config");

function notFound(req, res) {
  res.status(404).json({ error: "Recurso no encontrado", path: req.originalUrl });
}

// Central error handler — never leaks stack traces to clients.
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;

  // Mongoose / cast errors → 400
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: "Datos inválidos", details: Object.values(err.errors).map((e) => e.message) });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ error: `Identificador inválido: ${err.value}` });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: "Registro duplicado", keys: Object.keys(err.keyValue || {}) });
  }

  if (status >= 500) {
    log.error(`${req.method} ${req.originalUrl} →`, err.stack || err.message);
  } else {
    log.warn(`${req.method} ${req.originalUrl} → ${status}: ${err.message}`);
  }

  const body = { error: err.message || "Error interno del servidor" };
  if (config.NODE_ENV !== "production" && status >= 500) body.stack = err.stack;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
