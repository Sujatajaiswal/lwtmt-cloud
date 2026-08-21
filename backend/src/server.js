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
app.set("trust proxy", 1);

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
  const days = Number(process.env.DEMO_DAYS || 10);
  const rowCount = Number(process.env.DEMO_ROW_COUNT || 120);
  const demoEnabled =
    String(process.env.SEED_DEMO_ON_START).toLowerCase() === "true" || stationCode === "SIM-STN-01";

  if (!Number.isInteger(days) || days < 1 || !Number.isInteger(rowCount) || rowCount < 1) {
    throw new Error("DEMO_DAYS and DEMO_ROW_COUNT must be positive integers");
  }

  const summary = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM survey_records) AS total_count,
       COUNT(*)::int AS demo_count,
      COUNT(DISTINCT recorded_at::date)::int AS demo_days,
      COALESCE(MAX(sr.gauge) - MIN(sr.gauge), 0)::float AS gauge_spread
     FROM survey_records sr
     JOIN surveys s ON s.id = sr.survey_id
     WHERE s.station_code = $1`,
    [stationCode]
  );

  const { total_count: totalCount, demo_count: demoCount, demo_days: demoDays, gauge_spread: gaugeSpread } = summary.rows[0];

  if (!demoEnabled && totalCount > 0) {
    console.log("Survey records already exist; skipping automatic demo seed.");
    return;
  }

  if (demoCount >= days * rowCount && demoDays >= days && gaugeSpread >= (days - 1) * 8) {
    console.log(`Demo station ${stationCode} already has ${demoDays} daily records; skipping demo seed.`);
    return;
  }

  const lastDay = new Date();
  lastDay.setUTCHours(9, 0, 0, 0);
  const firstDay = new Date(lastDay);
  firstDay.setUTCDate(firstDay.getUTCDate() - (days - 1));
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM surveys WHERE station_code = $1 AND designation = 'Simulation'", [stationCode]);

    const insertText = `
      INSERT INTO survey_records (
        survey_id, sample_no, recorded_at, reference_type, reference_point,
        station_code, chainage, loop_line_siding, turnout_no, curve_no,
        level_crossing_no, hectometer_post, latitude, longitude, distance,
        gauge, crossover, absolute_tilt, cumulative_tilt
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )`;

    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      const dayStart = new Date(firstDay.getTime() + dayIndex * 24 * 60 * 60 * 1000);
      const dayLabel = dayStart.toISOString().slice(0, 10);
      const surveyResult = await client.query(
        `INSERT INTO surveys (filename, station_code, surveyor_name, designation, row_count)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [`demo_${stationCode}_${dayLabel}.csv`, stationCode, "Demo Operator", "Simulation", rowCount]
      );
      const surveyId = surveyResult.rows[0].id;

      for (let i = 1; i <= rowCount; i += 1) {
        const recordedAt = new Date(dayStart.getTime() + i * 60 * 1000);
        const sampleSeed = dayIndex * rowCount + i;
        const chainage = Number((1000 + i * 2.5).toFixed(2));
        const crossLevel = demoReading(0, sampleSeed, 1.4);
        const twist = demoReading(0, sampleSeed, 0.5);

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
          demoReading(1660 + dayIndex * 12, sampleSeed, 2.8),
          crossLevel,
          crossLevel,
          twist,
        ]);
      }
    }

    await client.query("COMMIT");
    console.log(`Seeded ${days} demo surveys (${days * rowCount} rows) for station ${stationCode}.`);
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
