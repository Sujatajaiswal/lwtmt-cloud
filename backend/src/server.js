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

function demoReading(base, sampleNo, scale = 1) {
  const wave = Math.sin(sampleNo / 8) * scale;
  const drift = Math.cos(sampleNo / 17) * scale * 0.35;
  return Number((base + wave + drift).toFixed(3));
}

async function seedDemoSurveyIfEnabled() {
  const stationCode = process.env.DEMO_STATION_CODE || "SIM-STN-01";
  const rowCount = Number(process.env.DEMO_ROW_COUNT || 120);
  const demoEnabled = String(process.env.SEED_DEMO_ON_START).toLowerCase() === "true";
  const summary = await pool.query(
    `SELECT
       COUNT(*)::int AS total_count,
       COUNT(*) FILTER (
         WHERE station_code = $1 OR survey_id IN (SELECT id FROM surveys WHERE station_code = $1)
       )::int AS demo_count,
       MAX(recorded_at) FILTER (
         WHERE station_code = $1 OR survey_id IN (SELECT id FROM surveys WHERE station_code = $1)
       ) AS latest_demo_at
     FROM survey_records`,
    [stationCode]
  );

  const { total_count: totalCount, demo_count: demoCount, latest_demo_at: latestDemoAt } = summary.rows[0];
  const latestDemoTime = latestDemoAt ? new Date(latestDemoAt).getTime() : 0;
  const demoIsFresh = latestDemoTime > Date.now() - 24 * 60 * 60 * 1000;

  if (!demoEnabled && totalCount > 0) {
    console.log("Survey records already exist; skipping automatic demo seed.");
    return;
  }

  if (demoCount > 0 && demoIsFresh) {
    console.log(`Demo station ${stationCode} already has fresh records; skipping demo seed.`);
    return;
  }

  if (demoCount > 0) {
    console.log(`Demo station ${stationCode} exists but is stale; adding fresh demo rows.`);
  }

  const now = new Date();
  const start = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const surveyResult = await client.query(
      `INSERT INTO surveys (filename, station_code, surveyor_name, designation, row_count)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [`demo_${stationCode}_${Date.now()}.csv`, stationCode, "Demo Operator", "Simulation", rowCount]
    );
    const surveyId = surveyResult.rows[0].id;

    const insertText = `
      INSERT INTO survey_records (
        survey_id, sample_no, recorded_at, reference_type, reference_point,
        station_code, chainage, loop_line_siding, turnout_no, curve_no,
        level_crossing_no, hectometer_post, latitude, longitude, distance,
        gauge, crossover, absolute_tilt, cumulative_tilt
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )`;

    for (let i = 1; i <= rowCount; i += 1) {
      const recordedAt = new Date(start.getTime() + i * 60 * 1000);
      const chainage = Number((1000 + i * 2.5).toFixed(2));
      const crossLevel = demoReading(0, i, 1.4);
      const twist = demoReading(0, i, 0.5);

      await client.query(insertText, [
        surveyId,
        i,
        recordedAt.toISOString(),
        "Demo",
        `RP-${String(i).padStart(3, "0")}`,
        stationCode,
        chainage,
        "Main",
        null,
        null,
        null,
        null,
        13.0827 + i * 0.00001,
        80.2707 + i * 0.00001,
        Number((i * 2.5).toFixed(2)),
        demoReading(1676, i, 2.8),
        crossLevel,
        crossLevel,
        twist,
      ]);
    }

    await client.query("COMMIT");
    console.log(`Seeded ${rowCount} demo rows for station ${stationCode}.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function start() {
  try {
    await applySchemaIfConfigured();
    await seedDemoSurveyIfEnabled();
  } catch (err) {
    console.error("Database initialization failed:", err);
  }

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`LWTMT cloud backend listening on port ${PORT}`);
  });
}

start();
