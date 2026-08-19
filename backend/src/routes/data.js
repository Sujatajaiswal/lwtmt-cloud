const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const RECORD_COLUMNS = [
  ["sample_no", "Sample No"],
  ["recorded_at", "Date & Time"],
  ["station_code", "Station"],
  ["curve_no", "Curve"],
  ["level_crossing_no", "Level crossing"],
  ["hectometer_post", "Hectometer Post"],
  ["reference_point", "Reference Point"],
  ["latitude", "Lattitude"],
  ["longitude", "Longitude"],
  ["distance", "Distance"],
  ["gauge", "Gauge"],
  ["crossover", "Crossover"],
  ["cumulative_tilt", "Twist"],
  ["chainage", "Chainage"],
];

function isMissingTable(err) {
  return err.code === "42P01";
}

function buildRecordWhere({ start, end, station }) {
  const conditions = [];
  const params = [];

  if (station) {
    params.push(station);
    conditions.push(`COALESCE(sr.station_code, s.station_code) = $${params.length}`);
  }
  if (start) {
    params.push(start);
    conditions.push(`sr.recorded_at >= $${params.length}`);
  }
  if (end) {
    params.push(end);
    conditions.push(`sr.recorded_at <= $${params.length}`);
  }

  return {
    text: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

async function loadRecords(filters) {
  const where = buildRecordWhere(filters);

  const query = `
    SELECT
      sr.survey_id, sr.sample_no, sr.recorded_at, sr.reference_type, sr.reference_point,
      COALESCE(sr.station_code, s.station_code) AS station_code,
      sr.chainage, sr.loop_line_siding, sr.turnout_no, sr.curve_no,
      sr.level_crossing_no, sr.hectometer_post, sr.latitude, sr.longitude, sr.distance,
      sr.gauge, sr.crossover, sr.absolute_tilt, sr.cumulative_tilt
    FROM survey_records sr
    JOIN surveys s ON s.id = sr.survey_id
    ${where.text}
    ORDER BY sr.recorded_at ASC NULLS LAST, sr.sample_no ASC, sr.chainage ASC NULLS LAST, sr.id ASC`;

  const result = await pool.query(query, where.params);
  return result.rows;
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? formatDateTime(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function recordsToRows(records) {
  return records.map((record) =>
    RECORD_COLUMNS.map(([key]) => (key === "recorded_at" ? formatDateTime(record[key]) : record[key] ?? ""))
  );
}

function recordsToCsv(records) {
  const header = RECORD_COLUMNS.map(([, label]) => csvEscape(label)).join(",");
  const lines = recordsToRows(records).map((row) => row.map(csvEscape).join(","));
  return [header, ...lines].join("\r\n");
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function recordsToExcelHtml(records, station) {
  const headings = RECORD_COLUMNS.map(([, label]) => `<th>${htmlEscape(label)}</th>`).join("");
  const rows = recordsToRows(records)
    .map((row) => `<tr>${row.map((value) => `<td>${htmlEscape(value)}</td>`).join("")}</tr>`)
    .join("");

  return `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body>
  <h2>LWTMT Survey Records - ${htmlEscape(station || "All Stations")}</h2>
  <table border="1">
    <thead><tr>${headings}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function pdfEscape(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function recordsToPdf(records, station, start, end) {
  const lines = [
    `LWTMT Survey Records - ${station || "All Stations"}`,
    start || end ? `${formatDateTime(start) || "Start"} to ${formatDateTime(end) || "End"}` : "All available records",
    "",
    RECORD_COLUMNS.map(([, label]) => label).join(" | "),
    ...records.map((record) =>
      RECORD_COLUMNS.map(([key]) => (key === "recorded_at" ? formatDateTime(record[key]) : record[key] ?? "")).join(
        " | "
      )
    ),
  ];

  const chunks = [];
  for (let i = 0; i < lines.length; i += 58) {
    chunks.push(lines.slice(i, i + 58));
  }

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const kids = [];

  chunks.forEach((chunk, pageIndex) => {
    const contentLines = ["BT", "/F1 8 Tf", "28 810 Td"];
    chunk.forEach((line, index) => {
      if (index > 0) contentLines.push("0 -13 Td");
      contentLines.push(`(${pdfEscape(line).slice(0, 150)}) Tj`);
    });
    contentLines.push("0 -18 Td");
    contentLines.push(`(Page ${pageIndex + 1} of ${chunks.length}) Tj`);
    contentLines.push("ET");

    const stream = contentLines.join("\n");
    const pageObjectNumber = objects.length + 1;
    const streamObjectNumber = pageObjectNumber + 1;
    kids.push(`${pageObjectNumber} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamObjectNumber} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`
    );
  });

  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function filenameFor(station, ext) {
  const safeStation = String(station || "all_stations").replace(/[^a-z0-9_-]+/gi, "_");
  return `lwtmt_${safeStation}_records.${ext}`;
}

// GET /api/stations?start=...&end=...
// Returns distinct station codes seen within an optional time range (Page 3 dropdown).
router.get("/stations", requireAuth, async (req, res) => {
  const { start, end } = req.query;

  try {
    const conditions = ["COALESCE(sr.station_code, s.station_code) IS NOT NULL"];
    const params = [];

    if (start) {
      params.push(start);
      conditions.push(`sr.recorded_at >= $${params.length}`);
    }
    if (end) {
      params.push(end);
      conditions.push(`sr.recorded_at <= $${params.length}`);
    }

    const query = `
      SELECT DISTINCT COALESCE(sr.station_code, s.station_code) AS station_code
      FROM survey_records sr
      JOIN surveys s ON s.id = sr.survey_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY station_code`;

    const result = await pool.query(query, params);
    res.json({ stations: result.rows.map((r) => r.station_code) });
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn("survey_records table does not exist; returning an empty station list.");
      return res.json({ stations: [] });
    }

    console.error("Stations query error:", err);
    res.status(500).json({ error: "Failed to load stations" });
  }
});

// GET /api/graph-data?start=...&end=...&station=...
// Returns the 4 sensor series (Gauge, Cross Level, Twist, Chainage)
// plotted against date/time, for the given time range + station (Page 4).
router.get("/graph-data", requireAuth, async (req, res) => {
  const { start, end, station } = req.query;

  if (!start || !end || !station) {
    return res.status(400).json({ error: "start, end, and station are all required" });
  }

  try {
    const records = await loadRecords({ start, end, station });
    res.json({ station, start, end, points: records });
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn("survey_records table does not exist; returning empty graph data.");
      return res.json({ station, start, end, points: [] });
    }

    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Graph data query error:", err);
    res.status(500).json({ error: "Failed to load graph data" });
  }
});

// GET /api/records?start=...&end=...&station=...
// Returns CSV-like table rows for the records dashboard.
router.get("/records", requireAuth, async (req, res) => {
  const { start, end, station } = req.query;

  try {
    const records = await loadRecords({ start, end, station });
    res.json({
      station,
      start,
      end,
      columns: RECORD_COLUMNS.map(([key, label]) => ({ key, label })),
      records,
    });
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn("survey_records table does not exist; returning empty records.");
      return res.json({
        station,
        start,
        end,
        columns: RECORD_COLUMNS.map(([key, label]) => ({ key, label })),
        records: [],
      });
    }

    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Records query error:", err);
    res.status(500).json({ error: "Failed to load records" });
  }
});

// GET /api/records/export?format=csv|excel|pdf&start=...&end=...&station=...
router.get("/records/export", requireAuth, async (req, res) => {
  const { start, end, station, format = "csv" } = req.query;

  try {
    const records = await loadRecords({ start, end, station });

    if (format === "excel") {
      res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filenameFor(station, "xls")}"`);
      return res.send(recordsToExcelHtml(records, station));
    }

    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filenameFor(station, "pdf")}"`);
      return res.send(recordsToPdf(records, station, start, end));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameFor(station, "csv")}"`);
    return res.send(recordsToCsv(records));
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn("survey_records table does not exist; exporting an empty file.");
      const emptyRecords = [];

      if (format === "excel") {
        res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filenameFor(station, "xls")}"`);
        return res.send(recordsToExcelHtml(emptyRecords, station));
      }

      if (format === "pdf") {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filenameFor(station, "pdf")}"`);
        return res.send(recordsToPdf(emptyRecords, station, start, end));
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filenameFor(station, "csv")}"`);
      return res.send(recordsToCsv(emptyRecords));
    }

    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Records export error:", err);
    res.status(500).json({ error: "Failed to export records" });
  }
});

module.exports = router;
