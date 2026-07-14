// src/routes/demands.routes.js
const express = require("express");
const { getDemands, syncNow, syncStatus } = require("../controllers/demands.controller");
const { authenticateToken, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();
const planners = requireRole("admin", "dispatcher");

router.get("/demands", authenticateToken, getDemands);
router.get("/demands/sync-status", authenticateToken, syncStatus);
router.post("/demands/sync", authenticateToken, planners, syncNow);

module.exports = router;
