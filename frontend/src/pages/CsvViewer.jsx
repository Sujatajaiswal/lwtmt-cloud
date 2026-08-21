import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StepRail from "../components/StepRail";
import { api } from "../api";

function formatValue(value, key) {
  if (key !== "recorded_at" || !value) return value ?? "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function CsvViewer() {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const [columns, setColumns] = useState([]);
  const [records, setRecords] = useState([]);
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .recordView(surveyId)
      .then((res) => {
        setColumns(res.columns || []);
        setRecords(res.records || []);
        setSurvey(res.survey || null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [surveyId]);

  return (
    <div className="panel full-panel">
      <StepRail currentIndex={3} />
      <div className="viewer-heading">
        <div>
          <h1>CSV Viewer</h1>
          <p className="subtitle">{survey?.filename || "Survey records"}</p>
        </div>
        <button type="button" className="ghost-btn" onClick={() => navigate("/records")}>
          Back to CSV Records
        </button>
      </div>

      {loading && <div className="loading-text">Loading CSV records...</div>}
      {error && <div className="error-text">{error}</div>}

      {!loading && !error && (
        <>
          <div className="filter-summary">
            <span>Station: <b>{survey?.station_no || "-"}</b></span>
            <span>Rows: <b>{records.length}</b></span>
          </div>
          <div className="records-table-wrap">
            <table className="records-table">
              <thead>
                <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {records.map((record, index) => (
                  <tr key={`${record.survey_id || surveyId}-${record.sample_no || index}`}>
                    {columns.map((column) => (
                      <td key={column.key}>{formatValue(record[column.key], column.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}