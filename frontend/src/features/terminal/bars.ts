// Pure chart-data logic for the Terminal: history + live, Model A. No React, no chart library.
//
// Model A: the candle stream pushes a bar ONLY when its bucket closes. Between closes the
// price moves via snapshot.last_price, so the rightmost bar's TIP is built here from
// snapshots; the finalized bar from the stream then replaces it.
import type { KLineData } from 'klinecharts'
import type { Bar, CandleTimeframe } from '../../api'
import { addDaysNaive, datePart, ordinalMs } from '../../lib/naive'

export const TIMEFRAMES: CandleTimeframe[] = ['1m', '5m', '30m', '60m']

export const TIMEFRAME_MINUTES: Record<CandleTimeframe, number> = { '1m': 1, '5m': 5, '30m': 30, '60m': 60 }

/** Sessions of history to load per timeframe (coarser bars span more days). */
export const LOOKBACK_SESSIONS: Record<CandleTimeframe, number> = { '1m': 1, '5m': 3, '30m': 10, '60m': 20 }

/** A bar as the chart library wants it. Prices stay raw int64; labels are formatted later. */
export function toKLine(b: Bar): KLineData {
  return { timestamp: ordinalMs(b.start), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }
}

/**
 * Fold a FINALIZED bar into the history (sorted oldest-first): a newer bar is appended, the
 * same bucket replaces in place, an older one is ignored (it was already in the history
 * fetch, e.g. the bar closed between subscribing and fetching).
 */
export function mergeFinal(bars: Bar[], b: Bar): Bar[] {
  const last = bars[bars.length - 1]
  if (!last || b.start > last.start) return [...bars, b]
  if (b.start === last.start) return [...bars.slice(0, -1), b]
  return bars
}

/** The in-progress (not yet closed) bar, built from snapshot prices. */
export interface LiveBar {
  start: string
  open: number
  high: number
  low: number
  close: number
}

/**
 * Where the in-progress bucket starts: right after the last finalized bar of THIS session, or
 * at the session open when nothing has closed yet today. `sessionOpenAt` is today's open
 * (from GET /v1/markets); a finalized bar from an earlier day must not be mistaken for today's.
 */
export function liveBucketStart(lastFinal: Bar | null, sessionOpenAt: string | null): string | null {
  if (lastFinal && (!sessionOpenAt || lastFinal.end > sessionOpenAt)) return lastFinal.end
  return sessionOpenAt
}

/**
 * Extend (or start) the in-progress bar with a new last price. A new bucket opens at the
 * previous close, so the chart has no visual gap.
 */
export function advanceLive(prev: LiveBar | null, start: string, lastFinal: Bar | null, price: number): LiveBar {
  if (prev && prev.start === start) {
    return { start, open: prev.open, high: Math.max(prev.high, price), low: Math.min(prev.low, price), close: price }
  }
  const open = lastFinal && lastFinal.end === start ? lastFinal.close : price
  return { start, open, high: Math.max(open, price), low: Math.min(open, price), close: price }
}

export function liveToKLine(b: LiveBar): KLineData {
  return { timestamp: ordinalMs(b.start), open: b.open, high: b.high, low: b.low, close: b.close, volume: 0 }
}

/**
 * The history window: from the first session of the lookback to the close of today's session
 * (the server returns finalized bars only, so asking up to the close is safe).
 */
export function historyWindow(tf: CandleTimeframe, sessionOpenAt: string, sessionCloseAt: string): { from: string; to: string } {
  const back = LOOKBACK_SESSIONS[tf] - 1
  return { from: addDaysNaive(sessionOpenAt, -back), to: sessionCloseAt }
}

/** Is an ISO timestamp on the same market day as another? */
export function sameDay(a: string, b: string): boolean {
  return datePart(a) === datePart(b)
}
