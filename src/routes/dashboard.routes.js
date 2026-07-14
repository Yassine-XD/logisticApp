// src/routes/dashboard.routes.js
const express = require("express");
const { getKpis, getDashboard } = require("../controllers/dashboard.controller");
const { authenticateToken, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();
const planners = requireRole("admin", "dispatcher");

router.get("/dashboard", authenticateToken, planners, getDashboard);
router.get("/dashboard/kpis", authenticateToken, planners, getKpis);

module.exports = router;
