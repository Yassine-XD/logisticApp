// src/middleware/auth.middleware.js
const User = require("../models/User");
const { verifyAccessToken } = require("../utils/jwt");

/**
 * Verify JWT token and attach user to request
 */
async function authenticateToken(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({
        error: "Access denied. No token provided.",
      });
    }

    // Verify token
    const decoded = verifyAccessToken(token);

    // Check if user still exists
    const user = await User.findById(decoded.userId);
    if (!user || !user.active) {
      return res.status(401).json({
        error: "User no longer exists or is inactive.",
      });
    }

    // Check if user changed password after token was issued
    if (user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        error: "Password recently changed. Please log in again.",
      });
    }

    // Attach user info to request
    req.user = {
      userId: user._id,
      role: user.role,
      driverId: decoded.driverId,
      email: user.email,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      error: "Invalid or expired token.",
      details: error.message,
    });
  }
}

/**
 * Check if user has required role
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Access denied. Insufficient permissions.",
        required: allowedRoles,
        current: req.user.role,
      });
    }

    next();
  };
}

/**
 * Optional authentication (doesn't fail if no token)
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (token) {
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.userId);

      if (user && user.active) {
        req.user = {
          userId: user._id,
          role: user.role,
          driverId: decoded.driverId,
          email: user.email,
        };
      }
    }
  } catch (error) {
    // Silent fail - no auth is optional
  }

  next();
}

module.exports = {
  authenticateToken,
  requireRole,
  optionalAuth,
};
