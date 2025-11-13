const mongoose = require("mongoose");

const TourSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
    garage: { type: mongoose.Schema.Types.ObjectId, ref: "Garage" },
    demands: [{ type: mongoose.Schema.Types.ObjectId, ref: "Demand" }],
    startAt: Date,
    endAt: Date,
    status: { type: String, default: "draft" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tour", TourSchema);
