const express = require("express");
const morgan = require("morgan");
const routes = require("./routes");
const logger = require("./utils/logger");
const ApiError = require("./utils/errors");

const app = express();

app.use(morgan("dev"));
app.use(express.json());

app.use("/api", routes);

app.get("/", (req, res) => res.json({ ok: true }));

// 404
app.use((req, res, next) => {
  res.status(404).json({ error: "Not found" });
});

// error handler
app.use((err, req, res, next) => {
  logger.error(err);
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ error: message });
});

module.exports = app;
