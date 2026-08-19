import { useState } from "react";
import { useNavigate } from "react-router-dom";
import StepRail from "../components/StepRail";
import { useFilters } from "../context/FilterContext";

function isoLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

const QUICK_PICKS = [
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
];

export default function TimeRange() {
  const { timeRange, setTimeRange } = useFilters();
  const navigate = useNavigate();
  const [start, setStart] = useState(timeRange.start);
  const [end, setEnd] = useState(timeRange.end);
  const [selectedQuickPick, setSelectedQuickPick] = useState(null);
  const [error, setError] = useState("");

  function applyQuickPick(days) {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);
    setStart(isoLocal(from));
    setEnd(isoLocal(now));
    setSelectedQuickPick(days);
  }

  function handleNext(e) {
    e.preventDefault();
    if (!start || !end) {
      setError("Pick both a start and end date/time");
      return;
    }
    if (new Date(start) > new Date(end)) {
      setError("Start must be before end");
      return;
    }
    setError("");
    setTimeRange({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    navigate("/station");
  }

  return (
    <div className="panel wide-panel">
      <StepRail currentIndex={0} />
      <h1>Select Time Range</h1>
      <p className="subtitle">
        Choose the window of survey data to look at. This applies to all four sensors.
      </p>

      <div className="quick-picks">
        {QUICK_PICKS.map((qp) => (
          <button
            key={qp.label}
            type="button"
            className={"quick-pick" + (selectedQuickPick === qp.days ? " selected" : "")}
            onClick={() => applyQuickPick(qp.days)}
          >
            {qp.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleNext}>
        {error && <div className="error-text">{error}</div>}
        <div className="field-row">
          <div className="field">
            <label htmlFor="start">Start</label>
            <input
              id="start"
              type="datetime-local"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setSelectedQuickPick(null);
              }}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="end">End</label>
            <input
              id="end"
              type="datetime-local"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setSelectedQuickPick(null);
              }}
              required
            />
          </div>
        </div>

        <div className="actions-row">
          <button className="primary-btn" type="submit">
            Next: Station No
          </button>
        </div>
      </form>
    </div>
  );
}
