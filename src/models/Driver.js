const mongoose = require("mongoose");

const DriverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: String,
    vehicle: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Driver", DriverSchema);
