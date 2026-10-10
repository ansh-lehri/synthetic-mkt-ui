import { describe, expect, it } from 'vitest'
import { costLabel, costShortLabel, exitReasonTag } from './labels'

describe('labels', () => {
  it('names the known IN cost lines', () => {
    expect(costLabel('stt')).toBe('Securities transaction tax (STT)')
    expect(costShortLabel('gst')).toBe('GST')
  })
  it('still renders an unknown line name', () => {
    expect(costLabel('clearing_fee')).toBe('Clearing fee')
    expect(costShortLabel('clearing_fee')).toBe('Clearing fee')
  })
  it('tags only non-manual exits', () => {
    expect(exitReasonTag('manual')).toBeNull()
    expect(exitReasonTag('')).toBeNull()
    expect(exitReasonTag('autosquare')).toBe('auto')
    expect(exitReasonTag('stop_hit')).toBe('Stop hit')
  })
})
