import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { FilterProvider } from "./context/FilterContext";
import RequireAuth from "./components/RequireAuth";
import TopBar from "./components/TopBar";
import Login from "./pages/Login";
import TimeRange from "./pages/TimeRange";
import StationSelect from "./pages/StationSelect";
import Graphs from "./pages/Graphs";
import DataRecords from "./pages/DataRecords";
import CsvViewer from "./pages/CsvViewer";

function AuthedLayout({ children }) {
  return (
    <RequireAuth>
      <div className="app-shell">
        <TopBar />
        <div className="main-area">{children}</div>
      </div>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FilterProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/time-range"
              element={
                <AuthedLayout>
                  <TimeRange />
                </AuthedLayout>
              }
            />
            <Route
              path="/station"
              element={
                <AuthedLayout>
                  <StationSelect />
                </AuthedLayout>
              }
            />
            <Route
              path="/graphs"
              element={
                <AuthedLayout>
                  <Graphs />
                </AuthedLayout>
              }
            />
            <Route
              path="/records"
              element={
                <AuthedLayout>
                  <DataRecords />
                </AuthedLayout>
              }
            />
            <Route
              path="/records/:surveyId"
              element={
                <AuthedLayout>
                  <CsvViewer />
                </AuthedLayout>
              }
            />
            <Route path="*" element={<Navigate to="/time-range" replace />} />
          </Routes>
        </BrowserRouter>
      </FilterProvider>
    </AuthProvider>
  );
}
