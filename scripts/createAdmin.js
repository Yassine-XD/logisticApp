// scripts/createAdmin.js
const mongoose = require("mongoose");
const User = require("../src/models/User");
require("dotenv").config();

async function createAdmin() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);

    const admin = await User.create({
      email: "admin@volalte.com",
      password: "Admin123!",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
    });

    console.log("✅ Admin user created:");
    console.log("Email:", admin.email);
    console.log("Password: Admin123!");
    console.log("\n⚠️ Please change this password after first login!");

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error creating admin:", error.message);
    process.exit(1);
  }
}

createAdmin();
