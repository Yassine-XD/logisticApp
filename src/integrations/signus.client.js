const axios = require("axios");
const config = require("../config");
const logger = require("../utils/logger");

const client = axios.create({
  baseURL: config.SIGNUS_API_URL,
  timeout: 5000,
  headers: {
    Authorization: `Bearer ${config.SIGNUS_API_KEY}`,
    "Content-Type": "application/json",
  },
});

exports.fetchDemands = async () => {
  if (!config.SIGNUS_API_URL) {
    logger.warn("SIGNUS_API_URL not configured; returning empty list");
    return [];
  }
  try {
    const res = await client.get("/demands");
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    logger.error("Error fetching demands from Signus", err.message || err);
    return [];
  }
};
