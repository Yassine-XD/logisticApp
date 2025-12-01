// src/routes/demands.routes.js
const express = require("express");
const { getDemands, fetchDataFromSignus } = require("../controllers/demands.controller");


const router = express.Router();

router.get("/demands", getDemands);
router.get("/demandsx",  fetchDataFromSignus)

module.exports = router;
