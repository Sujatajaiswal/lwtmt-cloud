import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StepRail from "../components/StepRail";
import { useFilters } from "../context/FilterContext";
import { api } from "../api";

export default function StationSelect() {
  const { timeRange, station, setStation } = useFilters();
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(station);

  useEffect(() => {
    setLoading(true);
    setError("");
    setStations([]);
    api
      .stations(timeRange.start, timeRange.end)
      .then((res) => {
        setStations(res.stations);
        if (station && !res.stations.includes(station)) {
          setSelected("");
          setStation("");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [timeRange, station, setStation]);

  function handleNext(e) {
    e.preventDefault();
    if (!selected) {
      setError("Pick a station");
      return;
    }
    setStation(selected);
    navigate("/graphs");
  }

  return (
    <div className="panel wide-panel">
      <StepRail currentIndex={1} />
      <h1>Select Station No</h1>
      {timeRange.start && timeRange.end ? (
        <p className="subtitle">
          Stations with survey data between{" "}
          <b style={{ color: "var(--text)" }}>{new Date(timeRange.start).toLocaleString()}</b> and{" "}
          <b style={{ color: "var(--text)" }}>{new Date(timeRange.end).toLocaleString()}</b>.
        </p>
      ) : (
        <p className="subtitle">All stations with uploaded survey data. Select a time range to narrow the list.</p>
      )}

      {loading && <div className="loading-text">Loading stations...</div>}

      {!loading && (
        <form onSubmit={handleNext}>
          {error && <div className="error-text">{error}</div>}

          {stations.length === 0 ? (
            <p className="hint-text">No surveys found yet. Upload BBB data or choose a different time range.</p>
          ) : (
            <div className="field-row">
              <div className="field">
                <label htmlFor="station">Station Code</label>
                <select
                  id="station"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">Select a station...</option>
                  {stations.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="actions-row">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => navigate("/time-range")}
            >
              Back
            </button>
            <button className="primary-btn" type="submit" disabled={stations.length === 0}>
              Next: Graphs
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
