// src/controllers/dashboard.controller.js
const Tour = require("../models/Tour");
const Demand = require("../models/Demand");
const Driver = require("../models/Driver");
const { log } = require("../utils/logger");

/**
 * Helper function to get date range for today
 */
function getTodayRange() {
  const today = new Date();
  const dayStart = new Date(today);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(today);
  dayEnd.setHours(23, 59, 59, 999);
  return { dayStart, dayEnd };
}

/**
 * Helper function to get yesterday's range
 */
function getYesterdayRange() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dayStart = new Date(yesterday);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(yesterday);
  dayEnd.setHours(23, 59, 59, 999);
  return { dayStart, dayEnd };
}

/**
 * Calculate percentage trend
 */
function calculateTrend(today, yesterday) {
  if (yesterday === 0) return 0;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

/**
 * Get dashboard statistics
 */
async function getStats(req, res, next) {
  try {
    const { dayStart: todayStart, dayEnd: todayEnd } = getTodayRange();
    const { dayStart: yesterdayStart, dayEnd: yesterdayEnd } =
      getYesterdayRange();

    // 1. Active Tours (IN_PROGRESS today)
    const activeToursToday = await Tour.countDocuments({
      date: { $gte: todayStart, $lte: todayEnd },
      status: "IN_PROGRESS",
    });

    const activeToursYesterday = await Tour.countDocuments({
      date: { $gte: yesterdayStart, $lte: yesterdayEnd },
      status: "IN_PROGRESS",
    });

    // 2. Pending Demands (not assigned)
    const pendingDemandsToday = await Demand.countDocuments({
      status: { $in: ["NEW", "CONFIRMED"] },
      "assigned.driverId": { $exists: false },
    });

    const pendingDemandsYesterday = await Demand.countDocuments({
      status: { $in: ["NEW", "CONFIRMED"] },
      "assigned.driverId": { $exists: false },
      createdAt: { $lte: yesterdayEnd },
    });

    // 3. Active Drivers (distinct drivers on IN_PROGRESS tours today)
    const activeDriversResult = await Tour.aggregate([
      {
        $match: {
          date: { $gte: todayStart, $lte: todayEnd },
          status: "IN_PROGRESS",
        },
      },
      {
        $group: {
          _id: "$driver",
        },
      },
      {
        $count: "count",
      },
    ]);

    const activeDrivers = activeDriversResult[0]?.count || 0;

    const activeDriversYesterdayResult = await Tour.aggregate([
      {
        $match: {
          date: { $gte: yesterdayStart, $lte: yesterdayEnd },
          status: "IN_PROGRESS",
        },
      },
      {
        $group: {
          _id: "$driver",
        },
      },
      {
        $count: "count",
      },
    ]);

    const activeDriversYesterday = activeDriversYesterdayResult[0]?.count || 0;

    // 4. Total KG Collected today
    const kgCollectedTodayResult = await Tour.aggregate([
      {
        $match: {
          date: { $gte: todayStart, $lte: todayEnd },
        },
      },
      { $unwind: "$stops" },
      {
        $match: {
          "stops.status": { $in: ["COMPLETED", "PARTIAL"] },
          "stops.completedAt": { $gte: todayStart, $lte: todayEnd },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$stops.actualKg" },
        },
      },
    ]);

    const totalKgToday = kgCollectedTodayResult[0]?.total || 0;

    const kgCollectedYesterdayResult = await Tour.aggregate([
      {
        $match: {
          date: { $gte: yesterdayStart, $lte: yesterdayEnd },
        },
      },
      { $unwind: "$stops" },
      {
        $match: {
          "stops.status": { $in: ["COMPLETED", "PARTIAL"] },
          "stops.completedAt": { $gte: yesterdayStart, $lte: yesterdayEnd },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$stops.actualKg" },
        },
      },
    ]);

    const totalKgYesterday = kgCollectedYesterdayResult[0]?.total || 0;

    // 5. Average Tour Distance
    const avgDistanceResult = await Tour.aggregate([
      {
        $match: {
          date: { $gte: todayStart, $lte: todayEnd },
          status: { $in: ["IN_PROGRESS", "COMPLETED"] },
        },
      },
      {
        $group: {
          _id: null,
          avgDistance: { $avg: "$totalDistanceKm" },
        },
      },
    ]);

    const avgTourDistance = avgDistanceResult[0]?.avgDistance || 0;

    // 6. Completion Rate (on-time completion)
    const completionRateResult = await Tour.aggregate([
      {
        $match: {
          date: { $gte: todayStart, $lte: todayEnd },
        },
      },
      { $unwind: "$stops" },
      {
        $match: {
          "stops.completedAt": { $exists: true },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          onTime: {
            $sum: {
              $cond: [
                {
                  $lte: ["$stops.completedAt", "$stops.deadlineAt"],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const completionRate =
      completionRateResult[0]?.total > 0
        ? Math.round(
            (completionRateResult[0].onTime / completionRateResult[0].total) *
              100
          )
        : 0;

    // 7. Demands by Priority
    const demandsByPriorityResult = await Demand.aggregate([
      {
        $match: {
          status: { $in: ["NEW", "CONFIRMED"] },
        },
      },
      {
        $group: {
          _id: null,
          high: {
            $sum: {
              $cond: [{ $gte: ["$priority", 80] }, 1, 0],
            },
          },
          medium: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$priority", 40] },
                    { $lt: ["$priority", 80] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          low: {
            $sum: {
              $cond: [{ $lt: ["$priority", 40] }, 1, 0],
            },
          },
        },
      },
    ]);

    const demandsByPriority = demandsByPriorityResult[0] || {
      high: 0,
      medium: 0,
      low: 0,
    };

    // Build response
    const stats = {
      activeTours: {
        count: activeToursToday,
        trend: calculateTrend(activeToursToday, activeToursYesterday),
      },
      pendingDemands: {
        count: pendingDemandsToday,
        trend: calculateTrend(pendingDemandsToday, pendingDemandsYesterday),
      },
      activeDrivers: {
        count: activeDrivers,
        trend: calculateTrend(activeDrivers, activeDriversYesterday),
      },
      totalKgCollected: {
        value: totalKgToday,
        trend: calculateTrend(totalKgToday, totalKgYesterday),
      },
      avgTourDistance: {
        value: Number(avgTourDistance.toFixed(1)),
        unit: "km",
      },
      completionRate: {
        value: completionRate,
        unit: "%",
      },
      demandsByPriority: {
        high: demandsByPriority.high,
        medium: demandsByPriority.medium,
        low: demandsByPriority.low,
      },
    };

    res.json(stats);
  } catch (err) {
    next(err);
  }
}

/**
 * Get activity feed
 */
async function getActivity(req, res, next) {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const { dayStart, dayEnd } = getTodayRange();

    // Get recent tours and their stops for activity
    const recentTours = await Tour.find({
      updatedAt: { $gte: dayStart, $lte: dayEnd },
    })
      .populate("driver")
      .sort({ updatedAt: -1 })
      .limit(limit * 2); // Get more to ensure we have enough activities

    const activities = [];

    for (const tour of recentTours) {
      // Tour assignment activity
      if (
        tour.createdAt >= dayStart &&
        tour.createdAt <= dayEnd &&
        activities.length < limit
      ) {
        activities.push({
          id: `act_tour_${tour._id}`,
          type: "assigned",
          driver: {
            id: tour.driver._id.toString(),
            name: tour.driver.name,
          },
          timestamp: tour.createdAt.toISOString(),
          description: `Assigned new tour with ${tour.stops.length} stops`,
          tourId: tour._id.toString(),
        });
      }

      // Stop activities
      for (const stop of tour.stops) {
        if (!stop.completedAt || activities.length >= limit) continue;
        if (stop.completedAt < dayStart || stop.completedAt > dayEnd) continue;

        let activityType = "completed";
        let description = `Completed stop at ${stop.garageName}`;

        if (stop.status === "COMPLETED") {
          activityType = "completed";
          description = `Completed stop at ${stop.garageName}`;
        } else if (stop.status === "PARTIAL") {
          activityType = "partial";
          description = `Partial collection at ${stop.garageName} - ${stop.actualKg}kg of ${stop.plannedKg}kg`;
        } else if (stop.status === "NOT_READY") {
          activityType = "not_ready";
          description = `Marked stop as not ready - ${
            stop.notes || "garage closed"
          }`;
        } else if (stop.status === "IN_PROGRESS" && stop.startedAt) {
          activityType = "started";
          description = `Started collection at ${stop.garageName}`;
        }

        activities.push({
          id: `act_stop_${stop._id}`,
          type: activityType,
          driver: {
            id: tour.driver._id.toString(),
            name: tour.driver.name,
          },
          location: stop.garageName,
          timestamp: stop.completedAt.toISOString(),
          description,
          tourId: tour._id.toString(),
          stopId: stop._id.toString(),
        });
      }
    }

    // Sort by timestamp (newest first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Return only the requested limit
    res.json(activities.slice(0, limit));
  } catch (err) {
    next(err);
  }
}

/**
 * Get tour locations for map
 */
async function getTourLocations(req, res, next) {
  try {
    const { dayStart, dayEnd } = getTodayRange();

    // Get all IN_PROGRESS tours
    const activeTours = await Tour.find({
      date: { $gte: dayStart, $lte: dayEnd },
      status: "IN_PROGRESS",
    }).populate("driver");

    const tourLocations = activeTours.map((tour) => {
      // Find next incomplete stop
      const nextStop = tour.stops.find(
        (stop) =>
          stop.status !== "COMPLETED" &&
          stop.status !== "PARTIAL" &&
          stop.status !== "NOT_READY"
      );

      // Get last completed stop
      const completedStops = tour.stops.filter(
        (s) => s.status === "COMPLETED" || s.status === "PARTIAL"
      );
      const lastCompleted = completedStops[completedStops.length - 1];

      // Current location: last completed stop or first stop
      let currentLocation = null;
      if (lastCompleted?.geo) {
        currentLocation = {
          lat: lastCompleted.geo.lat,
          lng: lastCompleted.geo.lng,
        };
      } else if (tour.stops[0]?.geo) {
        currentLocation = {
          lat: tour.stops[0].geo.lat,
          lng: tour.stops[0].geo.lng,
        };
      }

      // Calculate ETA for next stop
      let eta = "TBD";
      if (nextStop) {
        const avgMinutesPerStop = 45;
        const estimatedMinutes = avgMinutesPerStop;
        const etaDate = new Date(Date.now() + estimatedMinutes * 60000);
        eta = etaDate.toTimeString().slice(0, 5);
      }

      // Generate avatar URL
      const driverAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
        tour.driver.name
      )}`;

      return {
        tourId: tour._id.toString(),
        driverName: tour.driver.name,
        driverAvatar,
        currentLocation,
        nextStop: nextStop
          ? {
              name: nextStop.garageName,
              lat: nextStop.geo?.lat,
              lng: nextStop.geo?.lng,
              eta,
            }
          : null,
        status: tour.status,
        completedStops: completedStops.length,
        totalStops: tour.stops.length,
      };
    });

    res.json(tourLocations);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/dashboard - Combined endpoint (RECOMMENDED)
 * Returns stats + activities + tourLocations in one call
 */
async function getDashboard(req, res, next) {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const { dayStart, dayEnd } = getTodayRange();
    const { dayStart: yesterdayStart, dayEnd: yesterdayEnd } =
      getYesterdayRange();

    // Run all queries in parallel for performance
    const [
      activeToursToday,
      activeToursYesterday,
      pendingDemandsToday,
      pendingDemandsYesterday,
      activeDriversResult,
      activeDriversYesterdayResult,
      kgCollectedTodayResult,
      kgCollectedYesterdayResult,
      avgDistanceResult,
      completionRateResult,
      demandsByPriorityResult,
      recentTours,
      activeTours,
    ] = await Promise.all([
      // Stats queries
      Tour.countDocuments({
        // date: { $gte: todayStart, $lte: todayEnd },
        status: "IN_PROGRESS",
      }),
      Tour.countDocuments({
        date: { $gte: yesterdayStart, $lte: yesterdayEnd },
        status: "IN_PROGRESS",
      }),
      Demand.countDocuments({
        status: { $in: ["NEW", "CONFIRMED"] },
        "assigned.driverId": { $exists: false },
      }),
      Demand.countDocuments({
        status: { $in: ["NEW", "CONFIRMED"] },
        "assigned.driverId": { $exists: false },
        createdAt: { $lte: yesterdayEnd },
      }),
      Tour.aggregate([
        {
          $match: {
            // date: { $gte: todayStart, $lte: todayEnd },
            status: "IN_PROGRESS",
          },
        },
        { $group: { _id: "$driver" } },
        { $count: "count" },
      ]),
      Tour.aggregate([
        {
          $match: {
            date: { $gte: yesterdayStart, $lte: yesterdayEnd },
            status: "IN_PROGRESS",
          },
        },
        { $group: { _id: "$driver" } },
        { $count: "count" },
      ]),
      Tour.aggregate([
        { $match: 
            { 
                // date: { $gte: todayStart, $lte: todayEnd } 
            } },
        { $unwind: "$stops" },
        {
          $match: {
            "stops.status": { $in: ["COMPLETED", "PARTIAL"] },
            // "stops.completedAt": { $gte: todayStart, $lte: todayEnd },
          },
        },
        { $group: { _id: null, total: { $sum: "$stops.actualKg" } } },
      ]),
      Tour.aggregate([
        { $match: { date: { $gte: yesterdayStart, $lte: yesterdayEnd } } },
        { $unwind: "$stops" },
        {
          $match: {
            "stops.status": { $in: ["COMPLETED", "PARTIAL"] },
            "stops.completedAt": { $gte: yesterdayStart, $lte: yesterdayEnd },
          },
        },
        { $group: { _id: null, total: { $sum: "$stops.actualKg" } } },
      ]),
      Tour.aggregate([
        {
          $match: {
            // date: { $gte: todayStart, $lte: todayEnd },
            status: { $in: ["IN_PROGRESS", "COMPLETED"] },
          },
        },
        { $group: { _id: null, avgDistance: { $avg: "$totalDistanceKm" } } },
      ]),
      Tour.aggregate([
        { $match: { 
            // date: { $gte: todayStart, $lte: todayEnd } 
        } },
        { $unwind: "$stops" },
        { $match: { "stops.completedAt": { $exists: true } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            onTime: {
              $sum: {
                $cond: [
                  { $lte: ["$stops.completedAt", "$stops.deadlineAt"] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      Demand.aggregate([
        { $match: { status: { $in: ["NEW", "CONFIRMED"] } } },
        {
          $group: {
            _id: null,
            high: { $sum: { $cond: [{ $gte: ["$priority", 80] }, 1, 0] } },
            medium: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$priority", 40] },
                      { $lt: ["$priority", 80] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            low: { $sum: { $cond: [{ $lt: ["$priority", 40] }, 1, 0] } },
          },
        },
      ]),
      // Activity feed query
      Tour.find({
        updatedAt: { $gte: dayStart, $lte: dayEnd },
      })
        .populate("driver")
        .sort({ updatedAt: -1 })
        .limit(limit * 2),
      // Tour locations query
      Tour.find({
        // date: { $gte: todayStart, $lte: todayEnd },
        status: "IN_PROGRESS",
      }).populate("driver"),
    ]);

    // Build stats object
    const activeDrivers = activeDriversResult[0]?.count || 0;
    const activeDriversYesterday = activeDriversYesterdayResult[0]?.count || 0;
    const totalKgToday = kgCollectedTodayResult[0]?.total || 0;
    const totalKgYesterday = kgCollectedYesterdayResult[0]?.total || 0;
    const avgTourDistance = avgDistanceResult[0]?.avgDistance || 0;
    const completionRate =
      completionRateResult[0]?.total > 0
        ? Math.round(
            (completionRateResult[0].onTime / completionRateResult[0].total) *
              100
          )
        : 0;
    const demandsByPriority = demandsByPriorityResult[0] || {
      high: 0,
      medium: 0,
      low: 0,
    };

    const stats = {
      activeTours: {
        count: activeToursToday,
        trend: calculateTrend(activeToursToday, activeToursYesterday),
      },
      pendingDemands: {
        count: pendingDemandsToday,
        trend: calculateTrend(pendingDemandsToday, pendingDemandsYesterday),
      },
      activeDrivers: {
        count: activeDrivers,
        trend: calculateTrend(activeDrivers, activeDriversYesterday),
      },
      totalKgCollected: {
        value: totalKgToday,
        trend: calculateTrend(totalKgToday, totalKgYesterday),
      },
      avgTourDistance: {
        value: Number(avgTourDistance.toFixed(1)),
        unit: "km",
      },
      completionRate: {
        value: completionRate,
        unit: "%",
      },
      demandsByPriority: {
        high: demandsByPriority.high,
        medium: demandsByPriority.medium,
        low: demandsByPriority.low,
      },
    };

    // Build activities array
    const activities = [];

    for (const tour of recentTours) {
      if (
        tour.createdAt >= dayStart &&
        tour.createdAt <= dayEnd &&
        activities.length < limit
      ) {
        activities.push({
          id: `act_tour_${tour._id}`,
          type: "assigned",
          driver: {
            id: tour.driver._id.toString(),
            name: tour.driver.name,
          },
          timestamp: tour.createdAt.toISOString(),
          description: `Assigned new tour with ${tour.stops.length} stops`,
          tourId: tour._id.toString(),
        });
      }

      for (const stop of tour.stops) {
        if (!stop.completedAt || activities.length >= limit) continue;
        if (stop.completedAt < dayStart || stop.completedAt > dayEnd) continue;

        let activityType = "completed";
        let description = `Completed stop at ${stop.garageName}`;

        if (stop.status === "COMPLETED") {
          activityType = "completed";
          description = `Completed stop at ${stop.garageName}`;
        } else if (stop.status === "PARTIAL") {
          activityType = "partial";
          description = `Partial collection at ${stop.garageName} - ${stop.actualKg}kg of ${stop.plannedKg}kg`;
        } else if (stop.status === "NOT_READY") {
          activityType = "not_ready";
          description = `Marked stop as not ready - ${
            stop.notes || "garage closed"
          }`;
        } else if (stop.status === "IN_PROGRESS" && stop.startedAt) {
          activityType = "started";
          description = `Started collection at ${stop.garageName}`;
        }

        activities.push({
          id: `act_stop_${stop._id}`,
          type: activityType,
          driver: {
            id: tour.driver._id.toString(),
            name: tour.driver.name,
          },
          location: stop.garageName,
          timestamp: stop.completedAt.toISOString(),
          description,
          tourId: tour._id.toString(),
          stopId: stop._id.toString(),
        });
      }
    }

    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Build tour locations array
    const tourLocations = activeTours.map((tour) => {
      const nextStop = tour.stops.find(
        (stop) =>
          stop.status !== "COMPLETED" &&
          stop.status !== "PARTIAL" &&
          stop.status !== "NOT_READY"
      );

      const completedStops = tour.stops.filter(
        (s) => s.status === "COMPLETED" || s.status === "PARTIAL"
      );
      const lastCompleted = completedStops[completedStops.length - 1];

      let currentLocation = null;
      if (lastCompleted?.geo) {
        currentLocation = {
          lat: lastCompleted.geo.lat,
          lng: lastCompleted.geo.lng,
        };
      } else if (tour.stops[0]?.geo) {
        currentLocation = {
          lat: tour.stops[0].geo.lat,
          lng: tour.stops[0].geo.lng,
        };
      }

      let eta = "TBD";
      if (nextStop) {
        const avgMinutesPerStop = 45;
        const etaDate = new Date(Date.now() + avgMinutesPerStop * 60000);
        eta = etaDate.toTimeString().slice(0, 5);
      }

      const driverAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
        tour.driver.name
      )}`;

      return {
        tourId: tour._id.toString(),
        driverName: tour.driver.name,
        driverAvatar,
        currentLocation,
        nextStop: nextStop
          ? {
              name: nextStop.garageName,
              lat: nextStop.geo?.lat,
              lng: nextStop.geo?.lng,
              eta,
            }
          : null,
        status: tour.status,
        completedStops: completedStops.length,
        totalStops: tour.stops.length,
      };
    });

    // Return combined response
    res.json({
      stats,
      activities: activities.slice(0, limit),
      tourLocations,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  getActivity,
  getTourLocations,
  getDashboard,
};
