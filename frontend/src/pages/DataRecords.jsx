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
  if (key === "date_time") return formatDateTime(record[key]);
  return record[key] ?? "";
}

const DOCUMENT_COLUMNS = [
  { key: "serial_no", label: "S.NO" },
  { key: "date_time", label: "Date and Time" },
  { key: "type", label: "Type" },
  { key: "view_csv", label: "View CSV" },
  { key: "export", label: "Export" },
];

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
        setColumns(DOCUMENT_COLUMNS);
        setRecords(res.records || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [timeRange, station]);

  return (
    <div className="panel full-panel">
      <StepRail currentIndex={3} />
      <h1>CSV Records</h1>
      <p className="subtitle">Uploaded cloud CSV files from each BeagleBone start and stop session.</p>

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
          CSV Files: <b>{records.length}</b>
        </span>
      </div>

      {loading && <div className="loading-text">Loading CSV records...</div>}
      {error && <div className="error-text">{error}</div>}

      {!loading && !error && records.length === 0 && (
        <div className="empty-state">
          <h2>No CSV files found</h2>
          <p>Uploaded BBB survey files will appear here automatically.</p>
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
                <tr key={`${record.survey_id || record.filename || "survey"}-${index}`}>
                  {columns.map((column) => {
                    if (column.key === "view_csv") {
                      return (
                        <td key={column.key}>
                          <a className="table-action-btn" href={record.view_csv_url} target="_blank" rel="noreferrer">
                            View
                          </a>
                        </td>
                      );
                    }

                    if (column.key === "export") {
                      return (
                        <td key={column.key}>
                          <div className="table-action-group">
                            <a className="table-action-btn" href={record.export_excel_url}>
                              Excel
                            </a>
                            <a className="table-action-btn" href={record.export_pdf_url}>
                              PDF
                            </a>
                          </div>
                        </td>
                      );
                    }

                    return <td key={column.key}>{valueFor(record, column.key)}</td>;
                  })}
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
