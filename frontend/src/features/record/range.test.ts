import { describe, expect, it } from 'vitest'
import { addDays, beforeForRange, dateInZone, defaultRange, formatDay, formatTime, isDateStr, isOnOrAfter, lowerBound, startOfDayInZone } from './range'

const IST = 'Asia/Kolkata'
const NY = 'America/New_York'

describe('date strings', () => {
  it('validates real calendar dates', () => {
    expect(isDateStr('2026-10-09')).toBe(true)
    expect(isDateStr('2026-02-30')).toBe(false)
    expect(isDateStr('2026-10-9')).toBe(false)
    expect(isDateStr('')).toBe(false)
  })
  it('adds days across month/year/leap boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-10-09', -30)).toBe('2026-09-09')
  })
})

describe('market-day boundaries', () => {
  it('start of day in IST is 18:30Z the previous day', () => {
    expect(startOfDayInZone('2026-10-09', IST).toISOString()).toBe('2026-10-08T18:30:00.000Z')
  })
  it('handles DST: New York is UTC-4 in October, UTC-5 after the November change', () => {
    expect(startOfDayInZone('2026-10-09', NY).toISOString()).toBe('2026-10-09T04:00:00.000Z')
    expect(startOfDayInZone('2026-11-10', NY).toISOString()).toBe('2026-11-10T05:00:00.000Z')
    // the day the clocks change (2026-11-01) starts at UTC-4; the next day starts at UTC-5
    expect(startOfDayInZone('2026-11-01', NY).toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(startOfDayInZone('2026-11-02', NY).toISOString()).toBe('2026-11-02T05:00:00.000Z')
  })
  it('`before` for a range ending on a date is the start of the NEXT market day', () => {
    expect(beforeForRange('2026-10-09', IST)).toBe('2026-10-09T18:30:00.000Z')
  })
  it('a late-evening IST trade belongs to its IST date, not the UTC date', () => {
    const lateIst = new Date('2026-10-09T19:00:00Z') // 00:30 IST on the 10th
    expect(dateInZone(lateIst, IST)).toBe('2026-10-10')
    expect(dateInZone(lateIst, 'UTC')).toBe('2026-10-09')
  })
})

describe('range filtering', () => {
  const bound = lowerBound('2026-10-05', IST) // 2026-10-04T18:30Z
  it('keeps trades on/after the start of `from`, drops older ones', () => {
    expect(isOnOrAfter('2026-10-04T18:30:00Z', bound)).toBe(true)
    expect(isOnOrAfter('2026-10-04T18:29:59Z', bound)).toBe(false)
    expect(isOnOrAfter('2026-10-09T05:00:00Z', bound)).toBe(true)
  })
  it('default range ends today and spans 30 days', () => {
    const r = defaultRange(IST, new Date('2026-10-09T10:00:00Z'))
    expect(r).toEqual({ from: '2026-09-09', to: '2026-10-09' })
  })
})

describe('display', () => {
  it('formats a day and time in the market zone', () => {
    expect(formatDay('2026-10-09T19:00:00Z', IST)).toBe('10 Oct 2026')
    expect(formatTime('2026-10-09T14:34:10Z', IST)).toBe('20:04:10')
  })
  it('formats a plain date string without shifting it', () => {
    expect(formatDay('2026-09-29', IST)).toBe('29 Sep 2026')
    expect(formatDay('2026-09-29', NY)).toBe('29 Sep 2026')
  })
})
