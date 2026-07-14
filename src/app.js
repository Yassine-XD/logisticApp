// src/app.js
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const config = require("./config");

const authRoutes = require("./routes/auth.routes");
const healthRoutes = require("./routes/health.routes");
const demandsRoutes = require("./routes/demands.routes");
const driversRoutes = require("./routes/drivers.routes");
const vehiclesRoutes = require("./routes/vehicles.routes");
const planRoutes = require("./routes/plan.routes");
const toursRoutes = require("./routes/tours.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const settingsRoutes = require("./routes/settings.routes");
const usersRoutes = require("./routes/users.routes");
const { notFound, errorHandler } = require("./middleware/error.middleware");

const app = express();
app.set("trust proxy", 1);

// ── Security & parsing ───────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // the SPA is served separately (nginx/vite)
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const origins =
  config.WEB_ORIGIN === "*"
    ? true
    : config.WEB_ORIGIN.split(",").map((s) => s.trim());
app.use(cors({ origin: origins, credentials: true }));

app.use(express.json({ limit: "2mb" }));
if (config.NODE_ENV !== "test") app.use(morgan("tiny"));

// ── API ──────────────────────────────────────────────────────────────────
const api = express.Router();

// Stricter rate-limit on auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Inténtalo de nuevo más tarde." },
});
api.use("/auth", authLimiter);

api.use(authRoutes);
api.use(healthRoutes);
api.use(demandsRoutes);
api.use(driversRoutes);
api.use(vehiclesRoutes);
api.use(planRoutes);
api.use(toursRoutes);
api.use(dashboardRoutes);
api.use(settingsRoutes);
api.use(usersRoutes);

app.use("/api", api);

// ── Optional static SPA (single-container deploy) ─────────────────────────
// When the frontend is built into ./frontend/dist, serve it here.
const spaDir = path.join(__dirname, "..", "frontend", "dist");
try {
  // eslint-disable-next-line global-require
  if (require("fs").existsSync(spaDir)) {
    app.use(express.static(spaDir));
    app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(spaDir, "index.html")));
  }
} catch (_) {
  /* no SPA build present — API-only mode */
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
