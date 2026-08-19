require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("../db/pool");

async function main() {
  const schemaPath = path.join(__dirname, "..", "..", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  console.log("Applying schema.sql to database...");
  await pool.query(sql);
  console.log("Schema applied successfully.");
  await pool.end();
}

main().catch((err) => {
  console.error("Failed to initialize schema:", err);
  process.exit(1);
});
