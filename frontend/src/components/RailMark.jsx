// Stylized track-gauge mark: two rails + sleepers, tying the visual identity
// back to what LWTMT actually measures (gauge = distance between rails).
export default function RailMark({ className }) {
  return (
    <svg
      className={"rail-mark " + (className || "")}
      viewBox="0 0 64 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="4" y1="4" x2="4" y2="40" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="4" x2="60" y2="40" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <line x1="2" y1="10" x2="62" y2="10" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="2" y1="18" x2="62" y2="18" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="2" y1="26" x2="62" y2="26" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="2" y1="34" x2="62" y2="34" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
