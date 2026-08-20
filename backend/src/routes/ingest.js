const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

// Maps the CSV column names the BeagleBone already sends to our DB columns.
// Keeping the same field names on the wire means the trolley's upload code
// (push_latest_csv.sh / launch_railgui25_backend.py) doesn't need to change.
function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = String(value).trim();
  const ddMmYyyy = text.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (ddMmYyyy) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = ddMmYyyy;
    const offsetMinutes = Number(process.env.CSV_TIMEZONE_OFFSET_MINUTES || 330);
    const d = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      ) - offsetMinutes * 60 * 1000
    );
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function firstValue(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
      return row[name];
    }
  }
  return null;
}

// Same endpoint the BeagleBone already posts to on STOP: POST /api/survey
// Body shape: { filename: "...", data: [ {..row..}, {..row..}, ... ] }
router.post("/survey", async (req, res) => {
  const { filename, data } = req.body || {};

  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: "Expected a non-empty 'data' array of rows" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const first = data[0];
    const stationCode = firstValue(first, ["Station Code", "Station No", "Station"]) || null;
    const surveyorName = firstValue(first, ["Name", "Surveyor Name", "Surveyor"]) || null;
    const designation = firstValue(first, ["Designation"]) || null;
    const safeFilename = filename || `survey_${Date.now()}.csv`;

    const surveyResult = await client.query(
      `INSERT INTO surveys (filename, station_code, surveyor_name, designation, row_count)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [safeFilename, stationCode, surveyorName, designation, data.length]
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

    for (const row of data) {
      await client.query(insertText, [
        surveyId,
        toNumber(firstValue(row, ["Sample No", "Sample Number", "S.No", "S No"])),
        toTimestamp(firstValue(row, ["Date & Time", "Date Time", "Timestamp", "Recorded At"])),
        firstValue(row, ["Reference Type"]) || null,
        firstValue(row, ["Reference Point"]) || null,
        firstValue(row, ["Station Code", "Station No", "Station"]) || null,
        toNumber(firstValue(row, ["Chainage", "Chainage (m)"])),
        firstValue(row, ["Loop/Line Siding", "Loop Line Siding"]) || null,
        firstValue(row, ["Turn-out No", "Turnout No", "Turn Out No"]) || null,
        firstValue(row, ["Curve No"]) || null,
        firstValue(row, ["Level Crossing No"]) || null,
        firstValue(row, ["Hectometer Post"]) || null,
        toNumber(firstValue(row, ["Lattitude", "Latitude"])),
        toNumber(firstValue(row, ["Longitude"])),
        toNumber(firstValue(row, ["Distance", "Distance (m)"])),
        toNumber(firstValue(row, ["Gauge", "Gauge (mm)"])),
        toNumber(firstValue(row, ["Crossover", "Cross Level", "Crosslevel"])),
        toNumber(firstValue(row, ["Absolute Tilt", "Abs Tilt"])),
        toNumber(firstValue(row, ["Twist", "Cumulative Tilt", "Cum Tilt"])),
      ]);
    }

    await client.query("COMMIT");
    res.json({ ok: true, surveyId, filename: safeFilename, rows: data.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Survey ingest error:", err);
    res.status(500).json({ error: "Failed to store survey" });
  } finally {
    client.release();
  }
});

module.exports = router;
