// src/app.js
const express = require("express");
const cors = require("cors");
const { log } = require("./utils/logger");

// Route modules
const healthRoutes = require("./routes/health.routes");
const demandsRoutes = require("./routes/demands.routes");
const driversRoutes = require("./routes/drivers.routes");
const vehiclesRoutes = require("./routes/vehicles.routes");
const planRoutes = require("./routes/plan.routes");
const toursRoutes = require("./routes/tours.routes");

const app = express();

/**
 * 1) Global middlewares
 */

// Parse JSON bodies | implement CORS
app.use(cors({ origin: true }));
app.use(express.json());

// Simple request logger
app.use((req, res, next) => {
  log(`${req.method} ${req.originalUrl}`);
  next();
});

/**
 * 2) API routes (versionable prefix)
 */

const apiRouter = express.Router();

// Attach feature routes
apiRouter.use(healthRoutes); // /health
apiRouter.use(demandsRoutes); // /demands
apiRouter.use(driversRoutes); // /drivers
apiRouter.use(vehiclesRoutes); // /vehicles
apiRouter.use(planRoutes); // /plans
apiRouter.use(toursRoutes); // /tours

// Prefix all API routes with /api
app.use("/api", apiRouter);

/**
 * 3) 404 handler (for any route not matched above)
 */
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

/**
 * 4) Global error handler
 */
app.use((err, req, res, next) => {
  log("Error:", err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
  });
});

module.exports = app;
