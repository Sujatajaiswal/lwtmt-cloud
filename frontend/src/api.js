export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include", // send the httpOnly session cookie
    headers: {
      "Content-Type": "application/json",
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
    request("/login", { method: "POST", body: JSON.stringify({ username, password }) }),
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
  recordsExportUrl: (start, end, station, format) => {
    const params = new URLSearchParams({ format });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (station) params.set("station", station);
    return `${API_BASE_URL}/records/export?${params.toString()}`;
  },
};
