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

function SensorTooltip({ active, payload, hoveredDataKey }) {
  if (!active || !payload?.length) return null;
  const entry = payload.find((item) => item.dataKey === hoveredDataKey) || payload[0];
  const row = entry.payload;
  const values = entry.value !== null && entry.value !== undefined && entry.value !== ""
    ? [entry]
    : [];

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

function ClickableLegend({ payload = [], onSelect }) {
  return (
    <div className="clickable-legend">
      {payload.map((entry) => (
        <button
          type="button"
          className="legend-date-btn"
          key={entry.dataKey}
          onClick={() => onSelect(entry.dataKey)}
          title={`View ${entry.value} details`}
        >
          <span className="legend-line" style={{ background: entry.color }} />
          {entry.value}
        </button>
      ))}
    </div>
  );
}

export default function Graphs() {
  const { timeRange, station } = useFilters();
  const navigate = useNavigate();
  const [points, setPoints] = useState([]);
  const [days, setDays] = useState([]);
  const [selectedPoints, setSelectedPoints] = useState({});
  const [hoveredSeries, setHoveredSeries] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasTimeRange = Boolean(timeRange.start && timeRange.end);
  const canLoadGraph = Boolean(hasTimeRange && station);

  function selectPoint(sensorKey, day, row, value) {
    if (!row?.recorded_at || value === undefined) return;
    setSelectedPoints((current) => ({
      ...current,
      [sensorKey]: { row, value, day: day.label },
    }));
  }

  function selectLine(sensorKey, day, lineData) {
    const dataKey = `${day.key}_${sensorKey}`;
    const activePoint = lineData?.activePayload?.find((entry) => entry.dataKey === dataKey)?.payload;
    const row = activePoint || lineData?.payload;
    selectPoint(sensorKey, day, row, row?.[dataKey]);
  }

  function selectHoveredPoint(sensorKey, chartState) {
    const dataKey = hoveredSeries[sensorKey];
    const entry = chartState?.activePayload?.find((item) => item.dataKey === dataKey);
    const day = days.find((item) => dataKey === `${item.key}_${sensorKey}`);
    const row = entry?.payload;
    if (day) selectPoint(sensorKey, day, row, row?.[dataKey]);
  }

  useEffect(() => {
    if (!canLoadGraph) {
      setLoading(false);
      setError("");
      setPoints([]);
      setDays([]);
      setSelectedPoints({});
      setHoveredSeries({});
      return;
    }

    setLoading(true);
    setError("");
    setPoints([]);
    setSelectedPoints({});
    setHoveredSeries({});
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
              <ResponsiveContainer width="100%" height={340}>
                <LineChart
                  data={points}
                  margin={{ top: 10, right: 22, bottom: 24, left: 20 }}
                  onMouseMove={(chartState) => selectHoveredPoint(sensor.key, chartState)}
                >
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="plot_distance"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    stroke="var(--muted)"
                    fontSize={11}
                    minTickGap={28}
                    tick={{ fill: "var(--text)", fontWeight: 700 }}
                    label={{ value: "Distance", position: "insideBottom", offset: -8, fill: "var(--text)", fontSize: 12, fontWeight: 700 }}
                  />
                  <YAxis
                    domain={sensor.key === "gauge" ? ["dataMin - 20", "dataMax + 20"] : ["auto", "auto"]}
                    stroke="var(--muted)"
                    fontSize={11}
                    tick={{ fill: "var(--text)", fontWeight: 700 }}
                    label={{
                      value: sensor.axisLabel,
                      angle: -90,
                      position: "insideLeft",
                      fill: "var(--text)",
                      fontSize: 12,
                      fontWeight: 700,
                      offset: -8,
                    }}
                  />
                  <Tooltip
                    shared={false}
                    content={<SensorTooltip hoveredDataKey={hoveredSeries[sensor.key]} />}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={72}
                    content={(legendProps) => (
                      <ClickableLegend
                        {...legendProps}
                        onSelect={(dataKey) => {
                          const day = days.find((item) => dataKey === `${item.key}_${sensor.key}`);
                          const row = day && points.find(
                            (item) => item.day_key === day.key && item[`${day.key}_${sensor.key}`] !== undefined
                          );
                          if (day && row) {
                            setSelectedPoints((current) => ({
                              ...current,
                              [sensor.key]: {
                                row,
                                value: row[`${day.key}_${sensor.key}`],
                                day: day.label,
                              },
                            }));
                          }
                        }}
                      />
                    )}
                  />
                  {days.map((day) => (
                    <Line
                      key={`${sensor.key}-${day.key}`}
                      type="monotone"
                      dataKey={`${day.key}_${sensor.key}`}
                      name={day.label}
                      stroke={day.color}
                      onClick={(lineData) => {
                        selectLine(sensor.key, day, lineData);
                      }}
                      onMouseEnter={(lineData) => {
                        setHoveredSeries((current) => ({
                          ...current,
                          [sensor.key]: `${day.key}_${sensor.key}`,
                        }));
                        selectLine(sensor.key, day, lineData);
                      }}
                      onMouseLeave={() => {
                        setHoveredSeries((current) => {
                          if (current[sensor.key] !== `${day.key}_${sensor.key}`) return current;
                          const next = { ...current };
                          delete next[sensor.key];
                          return next;
                        });
                      }}
                      style={{ cursor: "pointer" }}
                      dot={(dotProps) => {
                        const row = dotProps.payload;
                        const value = row?.[`${day.key}_${sensor.key}`];
                        if (!row?.recorded_at || value === undefined) return null;
                        return (
                          <circle
                            cx={dotProps.cx}
                            cy={dotProps.cy}
                            r={points.length <= 250 ? 3 : 2.5}
                            fill={day.color}
                            stroke="#ffffff"
                            strokeWidth={1}
                            style={{ cursor: "pointer" }}
                            onClick={(event) => {
                              event.stopPropagation();
                              selectPoint(sensor.key, day, row, value);
                            }}
                          />
                        );
                      }}
                      activeDot={{ r: 5 }}
                      strokeWidth={2}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              {selectedPoints[sensor.key] && (
                <div className="selected-point" role="status">
                  <strong>Selected sample: {selectedPoints[sensor.key].day}</strong>
                  <span>Date &amp; Time: {formatDateTime(selectedPoints[sensor.key].row.recorded_at)}</span>
                  <span>{sensor.label}: {selectedPoints[sensor.key].value ?? "-"} {sensor.unit}</span>
                  <span>Distance: {selectedPoints[sensor.key].row.distance ?? "-"}</span>
                  <span>Reference Type: {selectedPoints[sensor.key].row.reference_type ?? "-"}</span>
                  <span>Reference Point: {selectedPoints[sensor.key].row.reference_point ?? "-"}</span>
                  <span>Sample: {selectedPoints[sensor.key].row.sample_no ?? "-"}</span>
                </div>
              )}
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
