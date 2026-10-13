const DEFAULT_CSV_TIMEZONE_OFFSET_MINUTES = 330;
const configuredOffset = process.env.CSV_TIMEZONE_OFFSET_MINUTES;
const CSV_TIMEZONE_OFFSET_MINUTES =
  configuredOffset === undefined || configuredOffset.trim() === ""
    ? DEFAULT_CSV_TIMEZONE_OFFSET_MINUTES
    : Number(configuredOffset);

if (
  !Number.isInteger(CSV_TIMEZONE_OFFSET_MINUTES) ||
  Math.abs(CSV_TIMEZONE_OFFSET_MINUTES) > 14 * 60
) {
  throw new Error("CSV_TIMEZONE_OFFSET_MINUTES must be an integer between -840 and 840");
}

function normalizeColumnName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function firstValue(row, names) {
  const keysByNormalizedName = new Map(
    Object.keys(row).map((key) => [normalizeColumnName(key), key])
  );

  for (const name of names) {
    const key = keysByNormalizedName.get(normalizeColumnName(name));
    const value = key === undefined ? undefined : row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function toNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestampFromEpoch(value) {
  const epochMilliseconds = Math.abs(value) < 1e12 ? value * 1000 : value;
  const date = new Date(epochMilliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function localTimestampToDate(year, month, day, hour, minute, second, millisecond) {
  const parts = [year, month, day, hour, minute, second, millisecond].map(Number);
  const [parsedYear, parsedMonth, parsedDay, parsedHour, parsedMinute, parsedSecond, parsedMs] = parts;
  const date = new Date(
    Date.UTC(
      parsedYear,
      parsedMonth - 1,
      parsedDay,
      parsedHour,
      parsedMinute,
      parsedSecond,
      parsedMs
    )
  );

  if (
    date.getUTCFullYear() !== parsedYear ||
    date.getUTCMonth() !== parsedMonth - 1 ||
    date.getUTCDate() !== parsedDay ||
    date.getUTCHours() !== parsedHour ||
    date.getUTCMinutes() !== parsedMinute ||
    date.getUTCSeconds() !== parsedSecond ||
    date.getUTCMilliseconds() !== parsedMs
  ) {
    return null;
  }

  return new Date(date.getTime() - CSV_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
}

function toTimestamp(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return timestampFromEpoch(value);
  }

  const text = String(value).trim();
  if (/^-?\d{9,13}$/.test(text)) {
    return timestampFromEpoch(Number(text));
  }

  const dateParts = text.match(
    /^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/
  );

  if (dateParts) {
    const [, first, second, third, hour = "0", minute = "0", rawSecond = "0", fraction = "0"] =
      dateParts;
    const isDayFirst = first.length <= 2;
    const year = Number(isDayFirst ? third : first);
    const month = Number(second);
    const day = Number(isDayFirst ? first : third);
    const millisecond = Number(fraction.padEnd(3, "0"));
    const date = localTimestampToDate(year, month, day, hour, minute, rawSecond, millisecond);
    return date ? date.toISOString() : null;
  }

  const normalizedText = /[zZ]|[+-]\d{2}:?\d{2}$/.test(text)
    ? text.replace(" ", "T")
    : text;
  const date = new Date(normalizedText);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const localDate = new Date(date.getTime() + CSV_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(localDate.getUTCDate())}-${pad(localDate.getUTCMonth() + 1)}-${localDate.getUTCFullYear()} ${pad(
    localDate.getUTCHours()
  )}:${pad(localDate.getUTCMinutes())}:${pad(localDate.getUTCSeconds())}`;
}

module.exports = { firstValue, formatDateTime, toNumber, toTimestamp };
