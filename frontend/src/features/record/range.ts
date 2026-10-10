// Date-range maths for the Record screen. Pure, no React.
//
// The contract has no date-range params: lists are keyset-paginated by `before` (an RFC3339
// instant) and the broker axis returns RFC3339 instants. The board's From/To filter is
// therefore built from two pieces:
//   • To   -> the starting `before` cursor (start of the day AFTER `to`, market-local);
//   • From -> a client-side lower bound (start of `from`, market-local): rows older than it
//             are dropped and paging stops once the walk crosses it.
// "Days" are the MARKET's calendar days (its IANA timezone from GET /v1/markets), so a
// trade at 23:50 IST belongs to that IST date regardless of the browser's zone.

/** 'YYYY-MM-DD' calendar date (what <input type="date"> produces). */
export type DateStr = string

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isDateStr(v: string): boolean {
  const m = DATE_RE.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

/** Calendar-date arithmetic (no timezones involved). */
export function addDays(date: DateStr, days: number): DateStr {
  const m = DATE_RE.exec(date)!
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days))
  return t.toISOString().slice(0, 10)
}

/** The market-local calendar date of an instant. */
export function dateInZone(instant: Date, tz: string): DateStr {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

/** Offset (ms, local minus UTC) of `tz` at the given instant. */
function zoneOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/** The instant at which `date` starts (00:00) in `tz`. Handles DST transitions. */
export function startOfDayInZone(date: DateStr, tz: string): Date {
  const m = DATE_RE.exec(date)!
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // Two passes settle on the right offset even when the offset changes that day.
  let guess = wall - zoneOffsetMs(new Date(wall), tz)
  guess = wall - zoneOffsetMs(new Date(guess), tz)
  return new Date(guess)
}

/** Starting `before` cursor for a range ending on `to`: the start of the next market day. */
export function beforeForRange(to: DateStr, tz: string): string {
  return startOfDayInZone(addDays(to, 1), tz).toISOString()
}

/** Rows older than this instant are outside the range. */
export function lowerBound(from: DateStr, tz: string): Date {
  return startOfDayInZone(from, tz)
}

/** Is an RFC3339 timestamp on/after the lower bound? */
export function isOnOrAfter(iso: string, bound: Date): boolean {
  return new Date(iso).getTime() >= bound.getTime()
}

// ---- display (market-local)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "29 Sep 2026". A plain 'YYYY-MM-DD' is shown as-is; an instant is shown in `tz`.
 *  Month names come from a fixed table so output doesn't vary with the ICU version. */
export function formatDay(instantOrDate: string, tz: string): string {
  const date = isDateStr(instantOrDate) ? instantOrDate : dateInZone(new Date(instantOrDate), tz)
  const [y, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** "20:04:10" */
export function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
    new Date(iso),
  )
}

/** Default range: the last 30 market days, ending today. */
export function defaultRange(tz: string, now: Date = new Date()): { from: DateStr; to: DateStr } {
  const to = dateInZone(now, tz)
  return { from: addDays(to, -30), to }
}
