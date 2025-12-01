// src/routes/plan.routes.js
const express = require("express");
const { planGreedy } = require("../controllers/plan.controller");
const { planGreedyAdvanced } = require("../controllers/greedy.controller.advanced");

const router = express.Router();

// POST /api/plan/greedy
router.post("/plan/greedy", planGreedy);
router.post("/plan/greedy-advanced", planGreedyAdvanced); 

module.exports = router;
