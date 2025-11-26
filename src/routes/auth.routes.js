// src/routes/auth.routes.js
const express = require("express");
const {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  changePassword,
} = require("../controllers/auth.controller");
const { authenticateToken } = require("../middleware/auth.middleware");

const router = express.Router();

// Public routes
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/refresh", refreshToken);

// Protected routes
router.post("/auth/logout", authenticateToken, logout);
router.get("/auth/me", authenticateToken, getCurrentUser);
router.put("/auth/change-password", authenticateToken, changePassword);

module.exports = router;