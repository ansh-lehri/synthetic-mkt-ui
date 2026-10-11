import { describe, expect, it } from 'vitest'
import { marketNow } from './marketClock'

describe('marketNow', () => {
  it('renders an instant as the wall clock of the market zone', () => {
    const at = new Date('2026-10-12T04:30:00Z')
    expect(marketNow('Asia/Kolkata', at)).toBe('2026-10-12T10:00:00') // UTC+5:30
    expect(marketNow('America/New_York', at)).toBe('2026-10-12T00:30:00') // UTC-4 (DST)
  })
  it('crosses the date line and midnight correctly, never "24:00"', () => {
    expect(marketNow('Asia/Kolkata', new Date('2026-10-12T18:30:00Z'))).toBe('2026-10-13T00:00:00')
    expect(marketNow('UTC', new Date('2026-10-12T00:00:00Z'))).toBe('2026-10-12T00:00:00')
  })
})
