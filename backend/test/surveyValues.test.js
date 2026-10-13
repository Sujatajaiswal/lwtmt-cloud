const test = require("node:test");
const assert = require("node:assert/strict");
const { firstValue, formatDateTime, toNumber, toTimestamp } = require("../src/utils/surveyValues");

test("interprets device-local CSV timestamps using the configured default offset", () => {
  const timestamp = toTimestamp("13-10-2026 15:02:30");
  assert.equal(timestamp, "2026-10-13T09:32:30.000Z");
  assert.equal(formatDateTime(timestamp), "13-10-2026 15:02:30");
});

test("interprets ISO timestamps without a timezone as device-local time", () => {
  assert.equal(toTimestamp("2026-10-13 15:02:30"), "2026-10-13T09:32:30.000Z");
});

test("preserves timestamps that already specify their timezone", () => {
  assert.equal(toTimestamp("2026-10-13T15:02:30+05:30"), "2026-10-13T09:32:30.000Z");
  assert.equal(toTimestamp("2026-10-13T09:32:30Z"), "2026-10-13T09:32:30.000Z");
});

test("rejects invalid calendar timestamps and parses Unix epoch seconds", () => {
  assert.equal(toTimestamp("31-02-2026 15:02:30"), null);
  assert.equal(toTimestamp(1791883950), "2026-10-13T09:32:30.000Z");
  assert.equal(toTimestamp("1791883950"), "2026-10-13T09:32:30.000Z");
});

test("matches CSV field aliases independent of case and punctuation", () => {
  const row = {
    " date_time ": "13-10-2026 15:02:30",
    LATITUDE: "13.08270",
    "GPS Longitude": "80.27070",
  };

  assert.equal(firstValue(row, ["Date & Time", "recorded_at"]), "13-10-2026 15:02:30");
  assert.equal(toNumber(firstValue(row, ["Lattitude", "Latitude", "lat"])), 13.0827);
  assert.equal(toNumber(firstValue(row, ["Longitude", "GPS Longitude", "lon"])), 80.2707);
  assert.equal(toNumber("  "), null);
});
