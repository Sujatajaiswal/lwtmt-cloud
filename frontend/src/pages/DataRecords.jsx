import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StepRail from "../components/StepRail";
import { useFilters } from "../context/FilterContext";
import { api } from "../api";

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function valueFor(record, key) {
  if (key === "recorded_at") return formatDateTime(record[key]);
  return record[key] ?? "";
}

export default function DataRecords() {
  const { timeRange, station } = useFilters();
  const navigate = useNavigate();
  const [columns, setColumns] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasTimeRange = Boolean(timeRange.start && timeRange.end);

  useEffect(() => {
    setLoading(true);
    setError("");
    setRecords([]);
    api
      .records(timeRange.start, timeRange.end, station)
      .then((res) => {
        setColumns(res.columns || []);
        setRecords(res.records || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [timeRange, station]);

  const exportUrl = (format) => api.recordsExportUrl(timeRange.start, timeRange.end, station, format);

  return (
    <div className="panel full-panel">
      <StepRail currentIndex={3} />
      <h1>CSV Records</h1>
      <p className="subtitle">Incoming BeagleBone rows with reference points, location, distance, gauge, crossover, twist, and chainage.</p>

      <div className="filter-summary">
        <span>
          Station: <b>{station || "All stations"}</b>
        </span>
        <span>
          Range:{" "}
          <b>
            {hasTimeRange
              ? `${new Date(timeRange.start).toLocaleString()} -> ${new Date(timeRange.end).toLocaleString()}`
              : "All time"}
          </b>
        </span>
        <span>
          Rows: <b>{records.length}</b>
        </span>
      </div>

      <div className="export-bar">
        <a className="ghost-btn export-link" href={exportUrl("excel")}>
          Download Excel
        </a>
        <a className="ghost-btn export-link" href={exportUrl("pdf")}>
          Download PDF
        </a>
      </div>

      {loading && <div className="loading-text">Loading CSV records...</div>}
      {error && <div className="error-text">{error}</div>}

      {!loading && !error && records.length === 0 && (
        <div className="empty-state">
          <h2>No CSV data found</h2>
          <p>Uploaded BBB survey rows will appear here automatically.</p>
        </div>
      )}

      {!loading && !error && records.length > 0 && (
        <div className="records-table-wrap">
          <table className="records-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={`${record.survey_id}-${record.sample_no}-${index}`}>
                  {columns.map((column) => (
                    <td key={column.key}>{valueFor(record, column.key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="actions-row" style={{ marginTop: 28 }}>
        <button type="button" className="ghost-btn" onClick={() => navigate("/graphs")}>
          Back
        </button>
      </div>
    </div>
  );
}
