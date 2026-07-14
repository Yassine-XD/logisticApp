// src/controllers/settings.controller.js
const Settings = require("../models/Settings");

/** GET /settings — public-ish (any authenticated user) so UI can white-label. */
async function getSettings(req, res, next) {
  try {
    const doc = await Settings.getSettings({ fresh: true });
    res.json({ settings: doc.toPublicJSON() });
  } catch (err) {
    next(err);
  }
}

/** PUT /settings — admin only. Masked password only overwritten when provided. */
async function updateSettings(req, res, next) {
  try {
    const patch = { ...req.body };
    // Never let the masked placeholder overwrite the stored password
    if (patch.signus && (patch.signus.pass === "" || patch.signus.pass === "••••••••")) {
      delete patch.signus.pass;
    }
    delete patch.key;
    const doc = await Settings.updateSettings(patch);
    res.json({ settings: doc.toPublicJSON() });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings };
