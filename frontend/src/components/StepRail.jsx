import { useNavigate } from "react-router-dom";

const STEPS = [
  { num: "01", label: "Time Range", path: "/time-range" },
  { num: "02", label: "Station No", path: "/station" },
  { num: "03", label: "Graphs", path: "/graphs" },
  { num: "04", label: "CSV Records", path: "/records" },
];

// currentIndex: which post-login step is active
export default function StepRail({ currentIndex }) {
  const navigate = useNavigate();

  return (
    <div className="step-rail" role="tablist" aria-label="Dashboard steps">
      {STEPS.map((step, i) => (
        <div key={step.num} style={{ display: "flex", alignItems: "center" }}>
          <button
            type="button"
            role="tab"
            aria-selected={i === currentIndex}
            className={
              "step " +
              (i === currentIndex ? "active" : i < currentIndex ? "done" : "")
            }
            onClick={() => navigate(step.path)}
          >
            <span className="num">{step.num}</span>
            <span>{step.label}</span>
          </button>
          {i < STEPS.length - 1 && <div className="tie" />}
        </div>
      ))}
    </div>
  );
}
