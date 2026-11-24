// Naive-local ISO helpers. A market timestamp is "2026-10-09T09:15:00" — wall-clock time in
// the market's own timezone, no offset (the timezone travels separately). The client never
// converts these to or from real instants.
//
// Where a number is needed (a chart's x-axis), `ordinalMs` reads the wall-clock fields as if
// they were UTC. That number is only an ORDINAL: monotonic and evenly spaced inside a day. It
// is never compared with the real clock; the chart formats it back with timezone "UTC", which
// prints exactly the original wall-clock fields.

const RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/

export function isNaiveIso(v: string): boolean {
  return RE.test(v)
}

/** Wall-clock ordinal of a naive-local timestamp (see the file header). */
export function ordinalMs(naive: string): number {
  const m = RE.exec(naive)
  if (!m) throw new RangeError(`not a naive-local ISO timestamp: ${naive}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
}

/** 'YYYY-MM-DD' part. */
export function datePart(naive: string): string {
  return naive.slice(0, 10)
}

/** 'HH:MM:SS' part. */
export function timePart(naive: string): string {
  return naive.slice(11)
}

/** Shift a naive-local timestamp by whole calendar days (no timezone involved). */
export function addDaysNaive(naive: string, days: number): string {
  const m = RE.exec(naive)
  if (!m) throw new RangeError(`not a naive-local ISO timestamp: ${naive}`)
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days))
  return `${t.toISOString().slice(0, 10)}T${m[4]}:${m[5]}:${m[6]}`
}

/** Shift a naive-local timestamp by whole hours (no timezone involved; crosses day/month fine). */
export function addHoursNaive(naive: string, hours: number): string {
  const t = new Date(ordinalMs(naive) + hours * 3_600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`
}
