import { createContext, useContext, useEffect, useState } from "react";
import { api, setAuthToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    api
      .session()
      .then((res) => setUser({ username: res.username, role: res.role }))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  async function login(username, password) {
    const res = await api.login(username, password);
    setUser({ username: res.username, role: res.role });
  }

  async function logout() {
    await api.logout().catch(() => {});
    setAuthToken("");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, checkingSession, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
