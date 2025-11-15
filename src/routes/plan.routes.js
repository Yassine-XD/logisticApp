// src/routes/plan.routes.js
const express = require("express");
const { planGreedy } = require("../controllers/plan.controller");

const router = express.Router();

// POST /api/plan/greedy
router.post("/plan/greedy", planGreedy);

module.exports = router;
