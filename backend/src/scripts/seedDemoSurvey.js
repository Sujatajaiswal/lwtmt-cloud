require("dotenv").config();
const pool = require("../db/pool");

function reading(base, sampleNo, scale = 1) {
  const wave = Math.sin(sampleNo / 8) * scale;
  const drift = Math.cos(sampleNo / 17) * scale * 0.35;
  return Number((base + wave + drift).toFixed(3));
}

async function main() {
  const stationCode = process.argv[2] || "SIM-STN-01";
  const days = Number(process.argv[3] || 10);
  const rowCount = Number(process.argv[4] || 120);

  if (!Number.isInteger(days) || days < 1) {
    throw new Error("days must be a positive integer");
  }
  if (!Number.isInteger(rowCount) || rowCount < 1) {
    throw new Error("rowCount must be a positive integer");
  }

  const lastDay = new Date();
  lastDay.setUTCHours(9, 0, 0, 0);
  const firstDay = new Date(lastDay);
  firstDay.setUTCDate(firstDay.getUTCDate() - (days - 1));

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const insertText = `
      INSERT INTO survey_records (
        survey_id, sample_no, recorded_at, reference_type, reference_point,
        station_code, chainage, loop_line_siding, turnout_no, curve_no,
        level_crossing_no, hectometer_post, latitude, longitude, distance,
        gauge, crossover, twist
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
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
        const crossLevel = reading(0, sampleSeed, 1.4);
        const twist = reading(0, sampleSeed, 0.5);

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
          reading(1600 + dayIndex * 25, sampleSeed, 2.8),
          crossLevel,
          twist,
        ]);
      }
    }

    await client.query("COMMIT");
    const end = new Date(firstDay.getTime() + days * 24 * 60 * 60 * 1000);
    console.log(`Inserted ${days} demo surveys (${days * rowCount} rows) for station ${stationCode}.`);
    console.log(`Use a time range covering ${firstDay.toISOString()} to ${end.toISOString()}.`);
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
