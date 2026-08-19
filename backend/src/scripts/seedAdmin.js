require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../db/pool");

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env before seeding.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await pool.query("SELECT id FROM users WHERE username = $1", [username]);

  if (existing.rows.length > 0) {
    await pool.query("UPDATE users SET password_hash = $1, role = 'admin' WHERE username = $2", [
      passwordHash,
      username,
    ]);
    console.log(`Updated existing admin user "${username}".`);
  } else {
    await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
      [username, passwordHash]
    );
    console.log(`Created admin user "${username}".`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Failed to seed admin user:", err);
  process.exit(1);
});
