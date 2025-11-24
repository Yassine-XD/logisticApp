// src/services/plan.service.js
const mongoose = require("mongoose");
const Tour = require("../models/Tour");
const Demand = require("../models/Demand");
const { log } = require("../utils/logger");

// Minimal stub for planning logic (replace later with OR-Tools integration)
exports.plan = async ({ demands = [], drivers = [], garages = [] } = {}) => {
  // Very simple: return each demand as a solo tour
  return demands.map((d) => ({
    driver: null,
    demands: [d],
    status: "SCHEDULED",
  }));
};

/**
 * Persist greedy tours and mark demands as assigned.
 * Input: tours from buildGreedyTours(...)
 */
async function saveGreedyTours(tours) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const savedTours = [];

    for (const t of tours) {
      if (!t.stops.length) continue;

      const tourDoc = new Tour({
        driver: t.driverId,
        date: new Date(t.date),
        capacityKg: t.capacityKg,
        totalDistanceKm: t.totalDistanceKm,
        totalStops: t.totalStops,
        remainingCapacityKg: t.remainingCapacityKg,
        stops: [], // fill below
      });

      let seq = 1;

      for (const s of t.stops) {
        const demandId = s.demandId; // we need this in planningDemands
        tourDoc.stops.push({
          demand: demandId,
          signusCodigo: s.signusCodigo,
          garageId: s.garageId,
          garageName: s.garageName,
          kg: s.kg,
          lat: s.lat,
          lng: s.lng,
          order: seq,
          distanceFromPrevKm: s.distanceFromPrevKm,
          requestedAt: s.requestedAt,
          deadlineAt: s.deadlineAt,
          ageDays: s.ageDays,
          daysToDeadline: s.daysToDeadline,
          priority: s.priority,
          contact: { phone: s.contact?.phone },
          address: s.address,
          status: "SCHEDULED",
        });

        // mark demand as assigned
        await Demand.updateOne(
          { _id: demandId },
          {
            $set: {
              status: "SCHEDULED",
              assigned: {
                driverId: t.driverId,
                tourId: tourDoc._id,
                date: new Date(t.date),
                seq,
              },
            },
          },
          { session }
        );

        seq++;
      }

      await tourDoc.save({ session });
      savedTours.push(tourDoc);
    }

    await session.commitTransaction();
    session.endSession();

    log(`[Plan] Saved ${savedTours.length} tours`);
    return savedTours;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    log("[Plan] Error saving tours", err);
    throw err;
  }
}

module.exports = {
  saveGreedyTours,
};
