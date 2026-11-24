export const CENTRAL_TIME_ZONE = "America/Chicago";

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((item) => item.type === type)?.value ?? "";
}

export function centralInputValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = part(parts, "hour").padStart(2, "0");
  const minute = part(parts, "minute").padStart(2, "0");
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}T${hour}:${minute}`;
}

export function centralToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("Enter a date and time.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error("Enter a date and time.");
  }

  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wanted;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(utc));
    const shown = Date.UTC(
      Number(part(parts, "year")),
      Number(part(parts, "month")) - 1,
      Number(part(parts, "day")),
      Number(part(parts, "hour")),
      Number(part(parts, "minute")),
    );
    const delta = wanted - shown;
    if (delta === 0) break;
    utc += delta;
  }

  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) throw new Error("Enter a date and time.");
  return date.toISOString();
}

export function defaultScheduleInput() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${centralInputValue(tomorrow).slice(0, 11)}09:00`;
}

export function formatCentral(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
