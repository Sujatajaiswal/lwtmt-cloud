const express = require("express");
const pool = require("../db/pool");
const { firstValue, toNumber, toTimestamp } = require("../utils/surveyValues");

const router = express.Router();

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
        survey_id, sample_no, recorded_at, name, designation, station_no,
        station_code, chainage, loop_line_siding, turnout_no, curve_no,
        level_crossing_no, hectometer_post,
        bridge_start, bridge_end, level_crossing_lc_in, level_crossing_lc_out,
        kilometer_post, points_crossing, curve_in, curve_out, ohe_mast_location,
        switch_expansion_joint, latitude, longitude, distance, gauge, crosslevel, twist
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
      )`;

    for (const row of data) {
      await client.query(insertText, [
        surveyId,
        toNumber(firstValue(row, ["Sample No", "Sample Number", "S.No", "S No"])),
        toTimestamp(
          firstValue(row, [
            "Date & Time",
            "Date Time",
            "Timestamp",
            "Recorded At",
            "recorded_at",
            "epoch_time",
          ])
        ),
        firstValue(row, ["Name"]) || null,
        firstValue(row, ["Designation"]) || null,
        firstValue(row, ["Station No", "Station"]) || null,
        firstValue(row, ["Station Code", "Station No", "Station"]) || null,
        toNumber(firstValue(row, ["Chainage", "Chainage (m)"])),
        firstValue(row, ["Loop/Line Siding", "Loop Line Siding"]) || null,
        firstValue(row, ["Turn-out No", "Turnout No", "Turn Out No"]) || null,
        firstValue(row, ["Curve No"]) || null,
        firstValue(row, ["Level Crossing No"]) || null,
        firstValue(row, ["Hectometer Post"]) || null,
        firstValue(row, ["Bridge (Start)"]) || null,
        firstValue(row, ["Bridge (End)"]) || null,
        firstValue(row, ["Level Crossing (LC) In"]) || null,
        firstValue(row, ["Level Crossing (LC) Out"]) || null,
        firstValue(row, ["Kilometer Post (KM)"]) || null,
        firstValue(row, ["Points & Crossing (P&C)"]) || null,
        firstValue(row, ["Curve-In"]) || null,
        firstValue(row, ["Curve Out"]) || null,
        firstValue(row, ["OHE Mast (OHEM) Location"]) || null,
        firstValue(row, ["Switch Expansion Joint (SEJ)"]) || null,
        toNumber(firstValue(row, ["Lattitude", "Latitude", "GPS Latitude", "lat"])),
        toNumber(firstValue(row, ["Longitude", "GPS Longitude", "lon", "lng"])),
        toNumber(firstValue(row, ["Distance", "Distance (m)"])),
        toNumber(firstValue(row, ["Gauge", "Gauge (mm)"])),
        toNumber(firstValue(row, ["Crosslevel", "Cross Level"])),
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
