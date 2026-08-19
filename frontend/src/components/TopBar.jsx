import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="top-bar">
      <div className="brand-box">
        <img className="header-logo" src="/static/railman-logo.png" alt="RailMan" />
      </div>
      <div className="emblem-container" aria-hidden="true">
        <span className="emblem-logo">LW</span>
      </div>
      <div className="nav-content">
        <div className="header-title-area">
          <h1 className="header-title">LWTMT Cloud</h1>
          <p className="header-subtitle">Track geometry monitoring console</p>
        </div>
        {user && (
          <div className="header-actions">
            <span className="admin-label">{user.username}</span>
            <span className="status-pill ok">Live</span>
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
