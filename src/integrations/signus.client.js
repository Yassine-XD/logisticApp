// src/integrations/signus.client.js
const axios = require("axios");
const { log } = require("../utils/logger");
require("dotenv").config({ path: "./.env" });

const username = process.env.SIGNUS_USER;
const password = process.env.SIGNUS_PASS;

//calculate the date of - three months
function dateMinus3Months() {
  const today = new Date();

  // clone date
  const target = new Date(today);

  // subtract 3 months
  target.setMonth(target.getMonth() - 3);

  // format YYYY-MM-DD
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function fetchAlbRecsRaw() {
  
  ////////////////////////////////////////////
  
  const res = await axios.get("https://aplicacion.signus.es/api/rest/albRecs", {
    auth: {
      username: username,
      password: password,
    },
    params: {
      crcCod: "R0805",
      estado: ["EN_CURSO", "ASIGNADA", "EN_TRANSITO"],
      peticionDesde: dateMinus3Months(),
    },
  });
  return res.data;
}

module.exports = {
  fetchAlbRecsRaw,
};
