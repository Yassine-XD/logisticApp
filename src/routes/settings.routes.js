// src/routes/settings.routes.js
const express = require("express");
const { getSettings, updateSettings } = require("../controllers/settings.controller");
const { authenticateToken, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/settings", authenticateToken, getSettings);
router.put("/settings", authenticateToken, requireRole("admin"), updateSettings);

module.exports = router;
