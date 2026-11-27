// The display keeps New York time wherever the browser happens to be, so the
// clock, the date and "today" agree with the weather it shows. These helpers
// convert between instants (epoch ms) and the New York wall clock.

export const TZ = "America/New_York";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

// The New York wall clock at an instant:
// { year, month (1-12), day, hour (0-23), minute, second, weekday (0 = Sunday),
//   offset } where offset is local minus UTC in ms (-18000000 in winter).
export function zoned(ms) {
  const o = {};
  for (const p of parts.formatToParts(ms)) if (p.type !== "literal") o[p.type] = Number(p.value);
  const asUtc = Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second);
  const offset = asUtc - Math.floor(ms / 1000) * 1000;
  return { ...o, weekday: new Date(asUtc).getUTCDay(), offset };
}

// The instant at which the New York wall clock reads the given date and time.
export function zonedToUtc(year, month, day, hour = 0, minute = 0, second = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = guess - zoned(guess).offset;
  const second_ = guess - zoned(first).offset; // settles it across a DST change
  return second_;
}

// The instant of New York midnight at the start of the day containing `ms`,
// `days` days later (or earlier, if negative).
export function startOfDay(ms, days = 0) {
  const z = zoned(ms);
  return zonedToUtc(z.year, z.month, z.day + days);
}

// "2026-11-27" for the New York date at an instant (`days` days later).
export function dateKey(ms, days = 0) {
  const z = zoned(startOfDay(ms, days) + 12 * 3600 * 1000);
  return `${z.year}-${String(z.month).padStart(2, "0")}-${String(z.day).padStart(2, "0")}`;
}

// Day of the year, 1-366, in New York.
export function dayOfYear(ms) {
  const z = zoned(ms);
  return Math.round((Date.UTC(z.year, z.month - 1, z.day) - Date.UTC(z.year, 0, 1)) / 86400000) + 1;
}
