import { createContext, useContext, useState } from "react";

const FilterContext = createContext(null);

export function FilterProvider({ children }) {
  const [timeRange, setTimeRange] = useState({ start: "", end: "" });
  const [station, setStation] = useState("");

  return (
    <FilterContext.Provider value={{ timeRange, setTimeRange, station, setStation }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  return useContext(FilterContext);
}
