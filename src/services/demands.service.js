const Demand = require("../models/Demand");

exports.list = async (query = {}) => {
  return Demand.find().limit(100).lean();
};

exports.getById = async (id) => {
  return Demand.findById(id).lean();
};

exports.create = async (payload) => {
  return Demand.create(payload);
};

exports.update = async (id, payload) => {
  return Demand.findByIdAndUpdate(id, payload, { new: true });
};

exports.remove = async (id) => {
  return Demand.findByIdAndDelete(id);
};

// upsert by externalId (used by sync job)
exports.upsertByExternalId = async (externalId, data) => {
  return Demand.findOneAndUpdate(
    { externalId },
    { $set: data },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};
