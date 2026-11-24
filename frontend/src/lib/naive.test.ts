import { describe, expect, it } from 'vitest'
import { addHoursNaive } from './naive'

describe('addHoursNaive', () => {
  it('shifts within the same day', () => {
    expect(addHoursNaive('2026-10-09T09:15:00', 3)).toBe('2026-10-09T12:15:00')
  })

  it('crosses a day boundary going forward', () => {
    expect(addHoursNaive('2026-10-09T22:00:00', 3)).toBe('2026-10-10T01:00:00')
  })

  it('crosses a day boundary going backward (negative hours)', () => {
    expect(addHoursNaive('2026-10-09T01:00:00', -3)).toBe('2026-10-08T22:00:00')
  })

  it('crosses a month boundary', () => {
    expect(addHoursNaive('2026-10-31T23:00:00', 2)).toBe('2026-11-01T01:00:00')
  })
})
