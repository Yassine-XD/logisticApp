// src/controllers/users.controller.js
const User = require("../models/User");
const Driver = require("../models/Driver");

function publicUser(u) {
  return {
    id: u._id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    phone: u.phone,
    active: u.active,
    driver: u.driver || null,
    lastLogin: u.lastLogin,
    createdAt: u.createdAt,
  };
}

async function listUsers(req, res, next) {
  try {
    const users = await User.find().populate("driver", "name").sort({ createdAt: -1 }).lean();
    res.json({ users: users.map(publicUser) });
  } catch (err) {
    next(err);
  }
}

async function getUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id).populate("driver", "name").lean();
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { email, password, firstName, lastName, phone, role, driverId } = req.body;
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ error: "email, password, firstName, lastName y role son obligatorios" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: "El email ya está registrado" });

    if (role === "driver") {
      if (!driverId) return res.status(400).json({ error: "driverId requerido para el rol conductor" });
      const driver = await Driver.findById(driverId);
      if (!driver) return res.status(404).json({ error: "Conductor no encontrado" });
    }

    const user = await User.create({
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      phone,
      role,
      driver: role === "driver" ? driverId : undefined,
    });
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const { firstName, lastName, phone, role, driverId, active } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    if (firstName != null) user.firstName = firstName;
    if (lastName != null) user.lastName = lastName;
    if (phone != null) user.phone = phone;
    if (active != null) user.active = active;
    if (role != null) user.role = role;
    if (driverId !== undefined) user.driver = driverId || undefined;
    if (user.role === "driver" && !user.driver) {
      return res.status(400).json({ error: "Un conductor debe estar vinculado a un perfil de conductor" });
    }
    await user.save();
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "newPassword debe tener al menos 6 caracteres" });
    }
    const user = await User.findById(req.params.id).select("+password");
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    user.refreshTokens = [];
    await user.save();
    res.json({ success: true, message: "Contraseña restablecida" });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    if (String(req.user.userId) === req.params.id) {
      return res.status(400).json({ error: "No puedes desactivar tu propia cuenta" });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, getUser, createUser, updateUser, resetPassword, deleteUser };
