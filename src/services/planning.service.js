// Minimal stub for planning logic (replace later with OR-Tools integration)
exports.plan = async ({ demands = [], drivers = [], garages = [] } = {}) => {
  // Very simple: return each demand as a solo tour
  return demands.map((d) => ({
    driver: null,
    demands: [d],
    status: "planned",
  }));
};
