const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

module.exports = {
  PORT: process.env.PORT || 3000,
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/volalte",
  SIGNUS_API_URL: process.env.SIGNUS_API_URL,
  SIGNUS_API_KEY: process.env.SIGNUS_API_KEY,
};
