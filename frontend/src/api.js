const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const fallbackApiBaseUrl = import.meta.env.DEV ? "http://localhost:4000/api" : "";
const TOKEN_STORAGE_KEY = "lwtmt_session_token";

export const API_BASE_URL = (configuredApiBaseUrl || fallbackApiBaseUrl).replace(/\/$/, "");

let authToken =
  typeof window === "undefined" ? "" : window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";

export function setAuthToken(token) {
  authToken = token || "";

  if (typeof window === "undefined") {
    return;
  }

  if (authToken) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function request(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error("Missing VITE_API_BASE_URL. Set it to the backend Render URL ending in /api.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include", // send the httpOnly session cookie
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch (err) {
    // no JSON body, ignore
  }

  if (!response.ok) {
    const message = (body && body.error) || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return body;
}

export const api = {
  login: (username, password) =>
    request("/login", { method: "POST", body: JSON.stringify({ username, password }) }).then((res) => {
      setAuthToken(res.token);
      return res;
    }),
  logout: () => request("/logout", { method: "POST" }),
  session: () => request("/session"),
  stations: (start, end) => {
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    return request(`/stations?${params.toString()}`);
  },
  graphData: (start, end, station) => {
    const params = new URLSearchParams({ start, end, station });
    return request(`/graph-data?${params.toString()}`);
  },
  records: (start, end, station) => {
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (station) params.set("station", station);
    return request(`/records?${params.toString()}`);
  },
  recordView: (surveyId) => {
    const params = new URLSearchParams({ surveyId });
    return request(`/records/view?${params.toString()}`);
  },
  recordsExportUrl: (start, end, station, format) => {
    const params = new URLSearchParams({ format });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (station) params.set("station", station);
    return `${API_BASE_URL}/records/export?${params.toString()}`;
  },
};
