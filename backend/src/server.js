require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const pool = require("./db/pool");
const authRoutes = require("./routes/auth");
const ingestRoutes = require("./routes/ingest");
const dataRoutes = require("./routes/data");

const app = express();

const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "lwtmt-cloud-backend" });
});

app.use("/api", authRoutes);
app.use("/api", ingestRoutes); // POST /api/survey (BeagleBone upload)
app.use("/api", dataRoutes); // /api/stations, /api/graph-data

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

async function applySchemaIfConfigured() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set; skipping database schema initialization.");
    return;
  }

  const schemaPath = path.join(__dirname, "..", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  console.log("Database schema is ready.");
}

async function start() {
  try {
    await applySchemaIfConfigured();
  } catch (err) {
    console.error("Database schema initialization failed:", err);
  }

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`LWTMT cloud backend listening on port ${PORT}`);
  });
}

start();
