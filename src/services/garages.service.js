const Garage = require("../models/Garage");

exports.list = async () => Garage.find().lean();

exports.create = async (payload) => Garage.create(payload);

exports.getById = async (id) => Garage.findById(id).lean();
