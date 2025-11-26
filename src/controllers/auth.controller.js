// src/controllers/auth.controller.js
const User = require("../models/User");
const Driver = require("../models/Driver");
const { generateTokens, verifyRefreshToken } = require("../utils/jwt");
const { log } = require("../utils/logger");

/**
 * POST /auth/register
 * Register new user (admin creates accounts)
 */
async function register(req, res, next) {
  try {
    const { email, password, firstName, lastName, phone, role, driverId } =
      req.body;

    // Validation
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({
        error:
          "Missing required fields: email, password, firstName, lastName, role",
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        error: "Email already registered.",
      });
    }

    // If role is driver, verify driver exists
    if (role === "driver") {
      if (!driverId) {
        return res.status(400).json({
          error: "driverId required for driver role",
        });
      }

      const driver = await Driver.findById(driverId);
      if (!driver) {
        return res.status(404).json({
          error: "Driver not found",
        });
      }
    }

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      phone,
      role,
      driver: role === "driver" ? driverId : undefined,
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(
      user._id,
      user.role,
      role === "driver" ? driverId : null
    );

    // Save refresh token
    user.refreshTokens.push({
      token: refreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });
    await user.save();

    log(`New user registered: ${email}`);

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        driverId: user.driver,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/login
 * Login user
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    // Find user (include password field)
    const user = await User.findOne({ email: email.toLowerCase() })
      .select("+password")
      .populate("driver");

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    // Check password
    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    // Check if user is active
    if (!user.active) {
      return res.status(403).json({
        error: "Account is inactive. Contact administrator.",
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(
      user._id,
      user.role,
      user.driver ? user.driver._id : null
    );

    // Save refresh token
    user.refreshTokens.push({
      token: refreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    log(`User logged in: ${email}`);

    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        driverId: user.driver ? user.driver._id : null,
        driverName: user.driver ? user.driver.name : null,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: "Refresh token is required",
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Find user and check if refresh token exists
    const user = await User.findById(decoded.userId);
    if (!user || !user.active) {
      return res.status(401).json({
        error: "Invalid refresh token",
      });
    }

    const tokenExists = user.refreshTokens.some(
      (t) => t.token === refreshToken && new Date() < t.expiresAt
    );

    if (!tokenExists) {
      return res.status(401).json({
        error: "Refresh token expired or invalid",
      });
    }

    // Generate new tokens
    const tokens = generateTokens(
      user._id,
      user.role,
      user.driver ? user.driver : null
    );

    // Save new refresh token
    user.refreshTokens.push({
      token: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Remove old refresh token
    user.refreshTokens = user.refreshTokens.filter(
      (t) => t.token !== refreshToken
    );

    await user.save();

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    return res.status(401).json({
      error: "Invalid refresh token",
    });
  }
}

/**
 * POST /auth/logout
 * Logout user (invalidate refresh token)
 */
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Remove refresh token from user
      const decoded = verifyRefreshToken(refreshToken);
      await User.updateOne(
        { _id: decoded.userId },
        { $pull: { refreshTokens: { token: refreshToken } } }
      );
    }

    log(`User logged out: ${req.user?.email || "unknown"}`);

    res.json({
      message: "Logged out successfully",
    });
  } catch (err) {
    // Even if error, still logout
    res.json({
      message: "Logged out successfully",
    });
  }
}

/**
 * GET /auth/me
 * Get current user info
 */
async function getCurrentUser(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).populate("driver");

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json({
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      active: user.active,
      emailVerified: user.emailVerified,
      lastLogin: user.lastLogin,
      driver: user.driver
        ? {
            id: user.driver._id,
            name: user.driver.name,
            phone: user.driver.phone,
            vehicle: user.driver.vehicle,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /auth/change-password
 * Change user password
 */
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Current password and new password are required",
      });
    }

    // Find user with password
    const user = await User.findById(req.user.userId).select("+password");

    // Verify current password
    const isPasswordCorrect = await user.comparePassword(currentPassword);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        error: "Current password is incorrect",
      });
    }

    // Update password
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    // Invalidate all refresh tokens (force re-login)
    user.refreshTokens = [];
    await user.save();

    log(`Password changed for user: ${user.email}`);

    res.json({
      message: "Password changed successfully. Please log in again.",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  changePassword,
};
