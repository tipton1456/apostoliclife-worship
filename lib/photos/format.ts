const PHOTO_TIME_ZONE = "America/Chicago";

export function formatPhotoCount(count: number) {
  const safe = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  return `${safe.toLocaleString("en-US")} ${safe === 1 ? "photo" : "photos"}`;
}

export function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${Math.round(size)} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function formatWhen(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHOTO_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDimensions(width: number | null, height: number | null) {
  if (!width || !height) return null;
  return `${width.toLocaleString("en-US")} × ${height.toLocaleString("en-US")}`;
}

export function formatLocation(latitude: number | null, longitude: number | null) {
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
