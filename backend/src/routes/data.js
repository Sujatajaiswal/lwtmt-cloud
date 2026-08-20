const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const RECORD_COLUMNS = [
  ["sample_no", "Sample No"],
  ["recorded_at", "Date & Time"],
  ["reference_type", "Reference Type"],
  ["reference_point", "Reference Point"],
  ["latitude", "Lattitude"],
  ["longitude", "Longitude"],
  ["distance", "Distance"],
  ["gauge", "Gauge"],
  ["crossover", "Crosslevel"],
  ["cumulative_tilt", "Twist"],
  ["chainage", "Chainage"],
];

const SURVEY_COLUMNS = [
  ["serial_no", "S.NO"],
  ["date_time", "Date and Time"],
  ["station_no", "Station No"],
  ["view_csv", "View CSV"],
  ["export", "Export"],
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

function buildSurveyWhere({ start, end, station }) {
  const conditions = [];
  const params = [];

  if (station) {
    params.push(station);
    conditions.push(
      `(s.station_code = $${params.length} OR EXISTS (
        SELECT 1 FROM survey_records sr_station
        WHERE sr_station.survey_id = s.id AND sr_station.station_code = $${params.length}
      ))`
    );
  }
  if (start) {
    params.push(start);
    conditions.push(
      `COALESCE(
        (SELECT MAX(sr_end.recorded_at) FROM survey_records sr_end WHERE sr_end.survey_id = s.id),
        s.uploaded_at
      ) >= $${params.length}`
    );
  }
  if (end) {
    params.push(end);
    conditions.push(
      `COALESCE(
        (SELECT MIN(sr_start.recorded_at) FROM survey_records sr_start WHERE sr_start.survey_id = s.id),
        s.uploaded_at
      ) <= $${params.length}`
    );
  }

  return {
    text: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

function buildSurveyIdWhere({ surveyId }) {
  if (!surveyId) {
    return { text: "", params: [] };
  }

  return { text: "WHERE sr.survey_id = $1", params: [surveyId] };
}

async function loadRecords(filters) {
  const where = filters.surveyId ? buildSurveyIdWhere(filters) : buildRecordWhere(filters);

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

async function loadSurveyRows(filters, baseUrl) {
  const where = buildSurveyWhere(filters);

  const query = `
    SELECT
      s.id AS survey_id,
      s.filename,
      s.station_code,
      COALESCE(MIN(sr.recorded_at), s.uploaded_at) AS started_at,
      COALESCE(MAX(sr.recorded_at), s.uploaded_at) AS stopped_at,
      COALESCE(
        NULLIF((ARRAY_AGG(sr.reference_type ORDER BY sr.recorded_at ASC NULLS LAST, sr.sample_no ASC))[1], ''),
        'Survey'
      ) AS type,
      COALESCE(s.row_count, COUNT(sr.id)::int, 0) AS row_count
    FROM surveys s
    LEFT JOIN survey_records sr ON sr.survey_id = s.id
    ${where.text}
    GROUP BY s.id
    ORDER BY started_at DESC NULLS LAST, s.id DESC`;

  const result = await pool.query(query, where.params);
  return result.rows.map((row, index) => ({
    serial_no: index + 1,
    survey_id: row.survey_id,
    filename: row.filename,
    station_code: row.station_code,
    date_time: row.started_at,
    started_at: row.started_at,
    stopped_at: row.stopped_at,
    station_no: row.station_code || "",
    row_count: Number(row.row_count || 0),
    view_csv_url: `${baseUrl}/records/export?format=csv&surveyId=${encodeURIComponent(row.survey_id)}&disposition=inline`,
    export_excel_url: `${baseUrl}/records/export?format=excel&surveyId=${encodeURIComponent(row.survey_id)}`,
    export_pdf_url: `${baseUrl}/records/export?format=pdf&surveyId=${encodeURIComponent(row.survey_id)}`,
  }));
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
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

function surveyFilename(record, ext) {
  const base = String(record?.filename || `survey_${record?.survey_id || "records"}`)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "_");
  return `${base}.${ext}`;
}

// GET /api/stations?start=...&end=...
// Returns distinct station codes seen within an optional time range (Page 3 dropdown).
router.get("/stations", requireAuth, async (req, res) => {
  const { start, end } = req.query;

  try {
    const where = buildSurveyWhere({ start, end, station: "" });
    const conditions = ["station_code IS NOT NULL"];

    const query = `
      SELECT DISTINCT station_code
      FROM (
        SELECT
          s.id,
          COALESCE(
            s.station_code,
            (ARRAY_AGG(sr.station_code ORDER BY sr.recorded_at ASC NULLS LAST, sr.sample_no ASC)
              FILTER (WHERE sr.station_code IS NOT NULL AND sr.station_code <> ''))[1]
          ) AS station_code
        FROM surveys s
        LEFT JOIN survey_records sr ON sr.survey_id = s.id
        ${where.text}
        GROUP BY s.id
      ) survey_stations
      WHERE ${conditions[0]}
      ORDER BY station_code`;

    const result = await pool.query(query, where.params);
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
// Returns the 4 sensor series (Gauge, Crossover, Absolute Tilt, Cumulative Tilt)
// with distance and date/time for graph plotting.
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
// Returns one row per uploaded CSV/session for the records dashboard.
router.get("/records", requireAuth, async (req, res) => {
  const { start, end, station } = req.query;

  try {
    const records = await loadSurveyRows({ start, end, station }, `${req.protocol}://${req.get("host")}/api`);
    res.json({
      station,
      start,
      end,
      columns: SURVEY_COLUMNS.map(([key, label]) => ({ key, label })),
      records,
    });
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn("surveys table does not exist; returning empty records.");
      return res.json({
        station,
        start,
        end,
        columns: SURVEY_COLUMNS.map(([key, label]) => ({ key, label })),
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

// GET /api/records/export?format=csv|excel|pdf&start=...&end=...&station=...&surveyId=...
router.get("/records/export", requireAuth, async (req, res) => {
  const { start, end, station, surveyId, disposition = "attachment", format = "csv" } = req.query;

  try {
    const records = await loadRecords({ start, end, station, surveyId });
    const survey = surveyId
      ? (await pool.query("SELECT id AS survey_id, filename FROM surveys WHERE id = $1", [surveyId])).rows[0]
      : null;

    if (format === "excel") {
      res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${survey ? surveyFilename(survey, "xls") : filenameFor(station, "xls")}"`
      );
      return res.send(recordsToExcelHtml(records, station));
    }

    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${survey ? surveyFilename(survey, "pdf") : filenameFor(station, "pdf")}"`
      );
      return res.send(recordsToPdf(records, station, start, end));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `${disposition === "inline" ? "inline" : "attachment"}; filename="${
        survey ? surveyFilename(survey, "csv") : filenameFor(station, "csv")
      }"`
    );
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
