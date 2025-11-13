const express = require("express");
const demands = require("./demands.routes");
const garages = require("./garages.routes");
const health = require("./health.routes");

const router = express.Router();

router.use("/demands", demands);
router.use("/garages", garages);
router.use("/health", health);

module.exports = router;
