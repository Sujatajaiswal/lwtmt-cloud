import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StepRail from "../components/StepRail";
import { useFilters } from "../context/FilterContext";
import { api } from "../api";

const SENSORS = [
  { key: "gauge", label: "Gauge", unit: "mm", axisLabel: "Gauge (mm)", color: "#2563eb" },
  { key: "crossover", label: "Crosslevel", unit: "mm", axisLabel: "Crosslevel (mm)", color: "#15945f" },
  { key: "cumulative_tilt", label: "Twist", unit: "mm", axisLabel: "Twist (mm)", color: "#c24134" },
];

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

function toChartPoints(records) {
  return records
    .map((record) => ({
      ...record,
      plot_distance: Number.isFinite(Number(record.distance)) ? Number(record.distance) : Number(record.chainage),
    }))
    .filter((record) => Number.isFinite(record.plot_distance));
}

function SensorTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  return (
    <div className="chart-tooltip">
      <div className="tooltip-time">{formatDateTime(row.recorded_at)}</div>
      <div>{payload[0].name}: {payload[0].value}</div>
      <div>Distance: {row.distance ?? "-"}</div>
      <div>Reference Type: {row.reference_type ?? "-"}</div>
      <div>Reference Point: {row.reference_point ?? "-"}</div>
      <div>Sample: {row.sample_no ?? "-"}</div>
    </div>
  );
}

export default function Graphs() {
  const { timeRange, station } = useFilters();
  const navigate = useNavigate();
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasTimeRange = Boolean(timeRange.start && timeRange.end);
  const canLoadGraph = Boolean(hasTimeRange && station);

  useEffect(() => {
    if (!canLoadGraph) {
      setLoading(false);
      setError("");
      setPoints([]);
      return;
    }

    setLoading(true);
    setError("");
    setPoints([]);
    api
      .graphData(timeRange.start, timeRange.end, station)
      .then((res) => setPoints(toChartPoints(res.points || [])))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [timeRange, station, canLoadGraph]);

  return (
    <div className="panel full-panel">
      <StepRail currentIndex={2} />
      <h1>Sensor Graphs</h1>
      <p className="subtitle">Gauge, Crosslevel, and Twist plotted against distance with date and time available at each sample.</p>

      <div className="filter-summary">
        <span>
          Station: <b>{station || "Not selected"}</b>
        </span>
        <span>
          Range:{" "}
          <b>
            {hasTimeRange
              ? `${new Date(timeRange.start).toLocaleString()} -> ${new Date(timeRange.end).toLocaleString()}`
              : "Not selected"}
          </b>
        </span>
        <span>
          Points: <b>{points.length}</b>
        </span>
      </div>

      {loading && <div className="loading-text">Loading graph data...</div>}
      {error && <div className="error-text">{error}</div>}

      {!loading && !error && points.length === 0 && (
        <div className="empty-state">
          <h2>{canLoadGraph ? "No data in this range" : "Select filters to view graph"}</h2>
          <p>
            {canLoadGraph
              ? "Try a different station or widen the time range."
              : "Choose a time range and station, then this graph will load here."}
          </p>
        </div>
      )}

      {!loading && points.length > 0 && (
        <div className="chart-grid">
          {SENSORS.map((sensor) => (
            <div className="chart-card" key={sensor.key}>
              <h3>
                <span className="dot" style={{ background: sensor.color }} />
                {sensor.label}
              </h3>
              <p className="unit">Y-axis: {sensor.axisLabel} | X-axis: Distance</p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={points} margin={{ top: 10, right: 22, bottom: 32, left: 20 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="plot_distance"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    stroke="var(--muted)"
                    fontSize={11}
                    minTickGap={28}
                    label={{ value: "Distance", position: "insideBottom", offset: -18, fill: "var(--muted)", fontSize: 12 }}
                  />
                  <YAxis
                    stroke="var(--muted)"
                    fontSize={11}
                    label={{
                      value: sensor.axisLabel,
                      angle: -90,
                      position: "insideLeft",
                      fill: "var(--muted)",
                      fontSize: 12,
                      offset: -8,
                    }}
                  />
                  <Tooltip content={<SensorTooltip />} />
                  <Line
                    type="monotone"
                    dataKey={sensor.key}
                    name={`${sensor.label} (${sensor.unit})`}
                    stroke={sensor.color}
                    dot={points.length <= 250 ? { r: 2 } : false}
                    activeDot={{ r: 4 }}
                    strokeWidth={2}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}

      <div className="actions-row" style={{ marginTop: 28 }}>
        <button type="button" className="ghost-btn" onClick={() => navigate("/station")}>
          Back
        </button>
      </div>
    </div>
  );
}
