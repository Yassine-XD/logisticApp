const express = require("express");
const controller = require("../controllers/garages.controller");

const router = express.Router();

router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:id", controller.getById);

module.exports = router;
