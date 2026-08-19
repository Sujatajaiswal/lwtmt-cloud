require("dotenv").config();
const pool = require("../db/pool");

function reading(base, sampleNo, scale = 1) {
  const wave = Math.sin(sampleNo / 8) * scale;
  const drift = Math.cos(sampleNo / 17) * scale * 0.35;
  return Number((base + wave + drift).toFixed(3));
}

async function main() {
  const stationCode = process.argv[2] || "SIM-STN-01";
  const rowCount = Number(process.argv[3] || 120);
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
      const crossLevel = reading(0, i, 1.4);
      const twist = reading(0, i, 0.5);

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
        reading(1676, i, 2.8),
        crossLevel,
        crossLevel,
        twist,
      ]);
    }

    await client.query("COMMIT");
    console.log(`Inserted ${rowCount} demo rows for station ${stationCode}.`);
    console.log(`Use a time range covering ${start.toISOString()} to ${now.toISOString()}.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed to seed demo survey:", err);
  process.exit(1);
});
