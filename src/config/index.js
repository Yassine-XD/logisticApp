const path = require("path");
require("dotenv").config({ path: "./.env" });

module.exports = {
  PORT: process.env.PORT || 3000,
  MONGO_URI: process.env.DATABASE_URL || "mongodb://localhost:27017/volalte",
  SIGNUS_API_URL: process.env.ALBARAN_RECOGIDA_API_LINK,
};
