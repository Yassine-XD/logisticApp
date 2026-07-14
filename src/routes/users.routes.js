// src/routes/users.routes.js
const express = require("express");
const ctrl = require("../controllers/users.controller");
const { authenticateToken, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();
const adminOnly = [authenticateToken, requireRole("admin")];

router.get("/users", ...adminOnly, ctrl.listUsers);
router.post("/users", ...adminOnly, ctrl.createUser);
router.get("/users/:id", ...adminOnly, ctrl.getUser);
router.put("/users/:id", ...adminOnly, ctrl.updateUser);
router.post("/users/:id/reset-password", ...adminOnly, ctrl.resetPassword);
router.delete("/users/:id", ...adminOnly, ctrl.deleteUser);

module.exports = router;
