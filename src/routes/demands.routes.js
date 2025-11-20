// src/routes/demands.routes.js
const express = require("express");
const { getDemands, refreshPreDemands } = require("../controllers/demands.controller");
const {refreshReadyDemandsFromDemands} = require("../services/ready.demands.service")

const router = express.Router();

router.get("/demands", getDemands);
router.get("/demandsx",  refreshPreDemands)

module.exports = router;
