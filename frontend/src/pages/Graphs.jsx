import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import StepRail from "../components/StepRail";
import { useFilters } from "../context/FilterContext";
import { api } from "../api";

const SENSORS = [
  { key: "gauge", label: "Track Gauge", unit: "mm", axisLabel: "Track Gauge (mm)", color: "#2563eb" },
  { key: "crossover", label: "Crosslevel", unit: "mm", axisLabel: "Crosslevel (mm)", color: "#15945f" },
  { key: "cumulative_tilt", label: "Twist", unit: "mm", axisLabel: "Twist (mm)", color: "#c24134" },
];

const DAY_COLORS = [
  "#2563eb",
  "#15945f",
  "#c24134",
  "#b7791f",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#4d7c0f",
  "#9333ea",
  "#0f766e",
  "#ea580c",
  "#475569",
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

function dateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateLabel(key) {
  if (key === "unknown") return "Unknown date";
  return new Date(`${key}T00:00:00`).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function toChartData(records) {
  const prepared = records
    .map((record) => ({
      ...record,
      plot_distance: Number.isFinite(Number(record.distance)) ? Number(record.distance) : Number(record.chainage),
      day_key: dateKey(record.recorded_at),
    }))
    .filter((record) => Number.isFinite(record.plot_distance));

  const days = [];
  const dayKeys = new Set();
  prepared.forEach((record) => {
    if (!dayKeys.has(record.day_key)) {
      dayKeys.add(record.day_key);
      days.push({
        key: record.day_key,
        label: dateLabel(record.day_key),
        color: DAY_COLORS[days.length % DAY_COLORS.length],
      });
    }
  });

  const chartPoints = prepared.map((record) => ({
    ...record,
    ...Object.fromEntries(
      SENSORS.map((sensor) => [`${record.day_key}_${sensor.key}`, record[sensor.key]])
    ),
  }));

  return { points: chartPoints, days };
}

function SensorTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const values = payload.filter((entry) => entry.value !== null && entry.value !== undefined && entry.value !== "");

  return (
    <div className="chart-tooltip">
      <div className="tooltip-time">{formatDateTime(row.recorded_at)}</div>
      {values.map((entry) => <div key={entry.dataKey}>{entry.name}: {entry.value}</div>)}
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
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasTimeRange = Boolean(timeRange.start && timeRange.end);
  const canLoadGraph = Boolean(hasTimeRange && station);

  useEffect(() => {
    if (!canLoadGraph) {
      setLoading(false);
      setError("");
      setPoints([]);
      setDays([]);
      return;
    }

    setLoading(true);
    setError("");
    setPoints([]);
    api
      .graphData(timeRange.start, timeRange.end, station)
      .then((res) => {
        const chartData = toChartData(res.points || []);
        setPoints(chartData.points);
        setDays(chartData.days);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [timeRange, station, canLoadGraph]);

  return (
    <div className="panel full-panel">
      <StepRail currentIndex={2} />
      <h1>Sensor Graphs</h1>
      <p className="subtitle">Track Gauge, Crosslevel, and Twist plotted against distance. Each day with data has its own colored line.</p>

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
                  <Legend />
                  {days.map((day) => (
                    <Line
                      key={`${sensor.key}-${day.key}`}
                      type="monotone"
                      dataKey={`${day.key}_${sensor.key}`}
                      name={day.label}
                      stroke={day.color}
                      dot={points.length <= 250 ? { r: 2 } : false}
                      activeDot={{ r: 4 }}
                      strokeWidth={2}
                      connectNulls={false}
                    />
                  ))}
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
