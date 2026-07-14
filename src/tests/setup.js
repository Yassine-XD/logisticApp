// Jest setup — point every suite at an isolated test DB and manage the
// mongoose connection lifecycle. NODE_ENV=test disables the cron scheduler.
process.env.NODE_ENV = "test";
process.env.MONGO_URI =
  process.env.TEST_MONGO_URI || "mongodb://localhost:27017/volalte_test";
process.env.SIGNUS_MODE = "mock";
process.env.ENGINE_API_KEY = "";
process.env.JWT_SECRET = "test_access_secret";
process.env.JWT_REFRESH_SECRET = "test_refresh_secret";

const mongoose = require("mongoose");

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});
