// Calendar helpers. Dates are stored as local 'YYYY-MM-DD' strings and months as 'YYYY-MM' keys,
// so nothing shifts when the browser's time zone does.

const pad = (n) => String(n).padStart(2, '0');

/** Today's date as 'YYYY-MM-DD' in the local time zone. */
export function todayISO() {
  return toISO(new Date());
}

/** A Date as 'YYYY-MM-DD' (local). */
export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' to a local Date at noon (noon avoids daylight-saving edge cases). */
export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1, 12);
}

/** The month key ('YYYY-MM') of a date string or Date. */
export function monthOf(value) {
  return (typeof value === 'string' ? value : toISO(value)).slice(0, 7);
}

/** Move a month key by n months. */
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1, 12);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Add n days to an ISO date. */
export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Number of days in a month key. */
export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Whole days from one ISO date to another (b - a). */
export function daysBetween(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000);
}

/** 'November 2026' style label. */
export function monthLabel(key, locale, style = 'long') {
  return fromISO(`${key}-01`).toLocaleDateString(locale, { month: style, year: 'numeric' });
}

/** 'Nov' style short month name. */
export function monthShort(key, locale) {
  return fromISO(`${key}-01`).toLocaleDateString(locale, { month: 'short' });
}

/** 'Thu, 26 Nov' style label for a day. */
export function dayLabel(iso, locale, withWeekday = true) {
  const opts = withWeekday ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' };
  return fromISO(iso).toLocaleDateString(locale, opts);
}

/** Friendly relative wording for a due date: 'today', 'tomorrow', 'in 3 days', '2 days late'. */
export function relativeDay(iso, from = todayISO()) {
  const n = daysBetween(from, iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days late`;
}

/** The last n month keys ending at (and including) key, oldest first. */
export function monthRange(key, n) {
  return Array.from({ length: n }, (_, i) => addMonths(key, i - n + 1));
}
