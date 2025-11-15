// src/routes/demands.routes.js
const express = require("express");
const { getDemands } = require("../controllers/demands.controller");

const router = express.Router();

router.get("/demands", getDemands);

module.exports = router;
