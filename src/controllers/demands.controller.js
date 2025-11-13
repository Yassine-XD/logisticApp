const service = require("../services/demands.service");

exports.list = async (req, res, next) => {
  try {
    const items = await service.list(req.query);
    res.json(items);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const item = await service.getById(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const created = await service.create(req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const updated = await service.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    await service.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
