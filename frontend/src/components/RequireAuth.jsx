import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireAuth({ children }) {
  const { user, checkingSession } = useAuth();

  if (checkingSession) {
    return <div className="loading-text" style={{ padding: 40 }}>Checking session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
