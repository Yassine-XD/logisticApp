// src/integrations/signus.client.js
const axios = require("axios");
const { log } = require("../utils/logger");
require("dotenv").config({ path: "./.env" });

const username = process.env.SIGNUS_USER;
const password = process.env.SIGNUS_PASS;
const crcCode = process.env.SIGNUS_CRC_CODE || "R0805"; // Your CRC code

/**
 * FIX #11: Consistent date calculation
 */
function dateMinus3Months() {
  const today = new Date();
  const target = new Date(today);
  target.setMonth(target.getMonth() - 3);

  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * FIX #12: Improved error handling and validation
 */
async function fetchAlbRecsRaw() {
  try {
    if (!username || !password) {
      throw new Error("SIGNUS credentials not configured (SIGNUS_USER, SIGNUS_PASS)");
    }

    const peticionDesde = dateMinus3Months();
    
    log(`📡 Fetching Signus albRecs from ${peticionDesde}...`);

    const res = await axios.get("https://aplicacion.signus.es/api/rest/albRecs", {
      auth: {
        username: username,
        password: password,
      },
      params: {
        crcCod: crcCode,
        estado: ["EN_CURSO", "ASIGNADA", "EN_TRANSITO"],
        peticionDesde: peticionDesde,
      },
      timeout: 30000, // 30 second timeout
    });

    // Validate response
    if (!res.data) {
      throw new Error("Signus API returned empty response");
    }

    if (res.data.msgCodigo && res.data.msgCodigo !== 0) {
      throw new Error(`Signus API error: ${res.data.msgDescripcion || "Unknown error"}`);
    }

    log(`✅ Signus API returned ${res.data.data?.length || 0} records`);

    return res.data;
  } catch (err) {
    if (err.response) {
      // API returned error response
      log(`❌ Signus API error: ${err.response.status} ${err.response.statusText}`);
      throw new Error(`Signus API error: ${err.response.status} ${err.response.statusText}`);
    } else if (err.request) {
      // No response received
      log(`❌ Signus API timeout or network error`);
      throw new Error("Signus API timeout or network error");
    } else {
      // Other error
      log(`❌ Signus client error: ${err.message}`);
      throw err;
    }
  }
}

/**
 * FIX #13: New function to post completed collections back to Signus
 * (Placeholder - implement according to Signus API docs)
 */
async function postCollectionComplete(albaranData) {
  try {
    log(`📤 Posting collection complete to Signus:`, albaranData);

    // TODO: Implement according to Signus API documentation
    // Example endpoint (replace with actual):
    // POST https://aplicacion.signus.es/api/rest/albRecs/{codigo}/complete

    const res = await axios.post(
      `https://aplicacion.signus.es/api/rest/albRecs/${albaranData.codigo}/complete`,
      {
        fechaRealRecogida: albaranData.fechaRealRecogida,
        kgReales: albaranData.kgReales,
        observaciones: albaranData.observaciones,
      },
      {
        auth: {
          username: username,
          password: password,
        },
        timeout: 15000,
      }
    );

    log(`✅ Collection completion posted to Signus`);
    return res.data;
  } catch (err) {
    log(`❌ Error posting to Signus:`, err.message);
    throw err;
  }
}

module.exports = {
  fetchAlbRecsRaw,
  postCollectionComplete,
};