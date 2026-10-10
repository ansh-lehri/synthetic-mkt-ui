import { describe, expect, it } from 'vitest'
import type { Bar } from '../../api'
import { addDaysNaive, ordinalMs } from '../../lib/naive'
import { advanceLive, historyWindow, liveBucketStart, mergeFinal, toKLine } from './bars'

const bar = (start: string, end: string, o: number, h: number, l: number, c: number): Bar => ({ start, end, open: o, high: h, low: l, close: c, volume: 10 })
const B1 = bar('2026-10-09T09:15:00', '2026-10-09T09:20:00', 10050, 10070, 10040, 10060)
const B2 = bar('2026-10-09T09:20:00', '2026-10-09T09:25:00', 10060, 10080, 10055, 10075)

describe('naive-local timestamps', () => {
  it('ordinals are monotonic and evenly spaced within a day', () => {
    expect(ordinalMs('2026-10-09T09:20:00') - ordinalMs('2026-10-09T09:15:00')).toBe(5 * 60_000)
  })
  it('an ordinal formats back to the SAME wall clock in "UTC" (no zone shift ever happens)', () => {
    const t = new Date(ordinalMs('2026-10-09T09:15:00'))
    expect(new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(t)).toBe('09:15')
  })
  it('rejects anything that is not naive-local ISO', () => {
    expect(() => ordinalMs('2026-10-09T09:15:00Z')).toThrow(RangeError)
    expect(() => ordinalMs('2026-10-09T09:15:00+05:30')).toThrow(RangeError)
  })
  it('shifts whole days', () => {
    expect(addDaysNaive('2026-10-09T09:15:00', -2)).toBe('2026-10-07T09:15:00')
    expect(addDaysNaive('2026-10-31T09:15:00', 1)).toBe('2026-11-01T09:15:00')
  })
})

describe('toKLine', () => {
  it('keeps prices as raw int64', () => {
    expect(toKLine(B1)).toEqual({ timestamp: ordinalMs(B1.start), open: 10050, high: 10070, low: 10040, close: 10060, volume: 10 })
  })
})

describe('mergeFinal', () => {
  it('appends a newer bar', () => expect(mergeFinal([B1], B2)).toEqual([B1, B2]))
  it('replaces the same bucket in place', () => {
    const fixed = { ...B2, close: 10090 }
    expect(mergeFinal([B1, B2], fixed)).toEqual([B1, fixed])
  })
  it('ignores a bar older than the history (already fetched)', () => expect(mergeFinal([B1, B2], B1)).toEqual([B1, B2]))
  it('starts a history from nothing', () => expect(mergeFinal([], B1)).toEqual([B1]))
  it('does not mutate its input', () => {
    const h = [B1]
    mergeFinal(h, B2)
    expect(h).toEqual([B1])
  })
})

describe('live tip (Model A)', () => {
  const open = '2026-10-09T09:15:00'
  it('the bucket starts after the last finalized bar of the session, or at the open', () => {
    expect(liveBucketStart(B2, open)).toBe(B2.end)
    expect(liveBucketStart(null, open)).toBe(open)
  })
  it("yesterday's last bar is not today's: the bucket starts at today's open", () => {
    const yesterday = bar('2026-10-08T15:25:00', '2026-10-08T15:30:00', 1, 2, 1, 2)
    expect(liveBucketStart(yesterday, open)).toBe(open)
  })
  it('a fresh bucket opens at the previous close (no gap) and tracks high/low/close from snapshots', () => {
    let live = advanceLive(null, B2.end, B2, 10080)
    expect(live).toEqual({ start: B2.end, open: 10075, high: 10080, low: 10075, close: 10080 })
    live = advanceLive(live, B2.end, B2, 10060)
    expect(live).toEqual({ start: B2.end, open: 10075, high: 10080, low: 10060, close: 10060 })
    live = advanceLive(live, B2.end, B2, 10090)
    expect(live).toEqual({ start: B2.end, open: 10075, high: 10090, low: 10060, close: 10090 })
  })
  it('with no previous bar the first price is the open', () => {
    expect(advanceLive(null, open, null, 10090)).toEqual({ start: open, open: 10090, high: 10090, low: 10090, close: 10090 })
  })
  it('when the bucket rolls over, the tip restarts from the closed bar', () => {
    const rolled = advanceLive({ start: B1.start, open: 1, high: 9, low: 0, close: 5 }, B1.end, B1, 10065)
    expect(rolled).toEqual({ start: B1.end, open: 10060, high: 10065, low: 10060, close: 10065 })
  })
})

describe('historyWindow', () => {
  it('spans N sessions back to the close of today', () => {
    expect(historyWindow('1m', '2026-10-09T09:15:00', '2026-10-09T15:30:00')).toEqual({ from: '2026-10-09T09:15:00', to: '2026-10-09T15:30:00' })
    expect(historyWindow('5m', '2026-10-09T09:15:00', '2026-10-09T15:30:00').from).toBe('2026-10-07T09:15:00')
    expect(historyWindow('60m', '2026-10-09T09:15:00', '2026-10-09T15:30:00').from).toBe('2026-09-20T09:15:00')
  })
})
