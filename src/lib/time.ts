// Week/month boundaries are computed in America/Chicago wall-clock time:
// the week starts Saturday 00:00 and points expire at the month rollover.

export const APP_TZ = "America/Chicago";

type WallParts = {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: number; // 0 = Sunday ... 6 = Saturday
  hour: number;
  minute: number;
  second: number;
};

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function wallParts(date: Date): WallParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    weekday: WEEKDAYS[p.weekday] ?? 0,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

function tzOffsetMs(date: Date): number {
  const p = wallParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The UTC instant of a Chicago wall-clock time.
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = guess - tzOffsetMs(new Date(guess));
  const secondPass = guess - tzOffsetMs(new Date(utc));
  if (secondPass !== utc) utc = secondPass;
  return new Date(utc);
}

function addWallDays(year: number, month: number, day: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

// Saturday 00:00 (Chicago) of the week containing `date`.
export function startOfWeekSaturday(date: Date): Date {
  const p = wallParts(date);
  const daysSinceSaturday = (p.weekday + 1) % 7;
  const s = addWallDays(p.year, p.month, p.day, -daysSinceSaturday);
  return zonedTimeToUtc(s.year, s.month, s.day);
}

// Every Saturday 00:00 boundary strictly after `marker`, up to and including `now`.
export function saturdayBoundaries(marker: Date, now: Date): Date[] {
  const out: Date[] = [];
  let boundary = startOfWeekSaturday(marker);
  if (boundary.getTime() <= marker.getTime()) {
    const p = wallParts(boundary);
    const n = addWallDays(p.year, p.month, p.day, 7);
    boundary = zonedTimeToUtc(n.year, n.month, n.day);
  }
  let guard = 0;
  while (boundary.getTime() <= now.getTime() && guard < 600) {
    out.push(boundary);
    const p = wallParts(boundary);
    const n = addWallDays(p.year, p.month, p.day, 7);
    boundary = zonedTimeToUtc(n.year, n.month, n.day);
    guard++;
  }
  return out;
}

// Every month rollover (the 1st, 00:00 Chicago) strictly after `marker`,
// up to and including `now`.
export function monthRollovers(marker: Date, now: Date): Date[] {
  const out: Date[] = [];
  const p = wallParts(marker);
  let year = p.year;
  let month = p.month;
  let boundary = zonedTimeToUtc(year, month, 1);
  if (boundary.getTime() <= marker.getTime()) {
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    boundary = zonedTimeToUtc(year, month, 1);
  }
  let guard = 0;
  while (boundary.getTime() <= now.getTime() && guard < 240) {
    out.push(boundary);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    boundary = zonedTimeToUtc(year, month, 1);
    guard++;
  }
  return out;
}

// "2026-11-01" in Chicago for a given instant.
export function chicagoDateString(date: Date): string {
  const p = wallParts(date);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${p.year}-${mm}-${dd}`;
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const n = addWallDays(y, m, d, days);
  const mm = String(n.month).padStart(2, "0");
  const dd = String(n.day).padStart(2, "0");
  return `${n.year}-${mm}-${dd}`;
}

// A date input's value ("2026-11-04") as a Date at Chicago midnight.
export function parseDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return zonedTimeToUtc(Number(m[1]), Number(m[2]), Number(m[3]));
}

// A datetime-local input's value ("2026-11-04T18:30"), read as Chicago
// wall-clock time. Falls back to the date-only form at Chicago midnight.
export function parseDateTimeInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (m) {
    return zonedTimeToUtc(
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      Number(m[4]),
      Number(m[5])
    );
  }
  return parseDateInput(value);
}

// A Date as a datetime-local input value in Chicago wall-clock time.
export function toChicagoInputValue(date: Date): string {
  const p = wallParts(date);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  const hh = String(p.hour).padStart(2, "0");
  const mi = String(p.minute).padStart(2, "0");
  return `${p.year}-${mm}-${dd}T${hh}:${mi}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
