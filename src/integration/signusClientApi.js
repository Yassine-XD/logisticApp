// src/integrations/signus.client.js
const axios = require("axios");
const { log } = require("../utils/logger");

const signus = axios.create({
  baseURL: process.env.SIGNUS_BASE_URL, // e.g. 'https://aplicacion.signus.es/api/rest'
  auth: {
    username: process.env.SIGNUS_USER,
    password: process.env.SIGNUS_PASS,
  },
  timeout: 15000,
});
async function fetchAlbRecs() {
  try {
    log("start fetching signus data")
    const res = await signus.get("/albRecs");
    if (res.data?.msgCodigo !== 0) {
      log("Signus albRecs non-zero msgCodigo:", res.data);
      throw new Error(
        "Signus albRecs error: " + (res.data?.msgDescripcion || "unknown")
      );
    }
    return res.data.data || [];
  } catch (err) {
    log("Error fetching albRecs from Signus:", err.message);
    throw err;
  }
}

module.exports = {
  fetchAlbRecs,
};
