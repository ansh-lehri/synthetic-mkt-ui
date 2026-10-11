// The market clock. The backend gives a market's open/close times (naive-local ISO) and its IANA
// timezone; the UI runs the clock itself: the browser's real time, rendered in the market's zone,
// ticking every second. It is DISPLAY-only (the bar's "Market time" and "Time left") — it is never
// compared with chart bars or order data, and the market PHASE still comes from the backend
// (`snapshot.phase`), not from this clock.
import { useEffect, useState } from 'react'

/** Naive-local ISO ("2026-10-12T10:00:00") for `at`, as the wall clock reads in `timeZone`. */
export function marketNow(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

/** The market's current naive-local time, re-read every second. Undefined until the zone is known. */
export function useMarketClock(timeZone: string | undefined): string | undefined {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!timeZone) return
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [timeZone])
  void tick // re-render each second; the value is derived from the real clock below
  return timeZone ? marketNow(timeZone) : undefined
}
