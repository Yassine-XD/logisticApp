// src/routes/plan.routes.js
const express = require("express");
const ctrl = require("../controllers/plans.controller");
const { authenticateToken, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();
const planners = requireRole("admin", "dispatcher");

router.post("/plans/optimize", authenticateToken, planners, ctrl.optimize);
router.get("/plans", authenticateToken, planners, ctrl.listPlans);
router.post("/plans/validate-edit", authenticateToken, planners, ctrl.validateEdit);
router.get("/plans/:id", authenticateToken, planners, ctrl.getPlan);
router.put("/plans/:id/routes", authenticateToken, planners, ctrl.saveRoutes);
router.post("/plans/:id/publish", authenticateToken, planners, ctrl.publish);
router.post("/plans/:id/discard", authenticateToken, planners, ctrl.discard);

module.exports = router;
