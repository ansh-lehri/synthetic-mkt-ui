import { describe, expect, it } from 'vitest'
import type { Instrument } from '../../api'
import { filterInstruments } from './symbolFilter'

const SYNTH_DEF: Instrument = { id: 'SYNTH_DEF', name: 'Synth Def Industries', tick_size: 5 }
const BETA: Instrument = { id: 'BETA', name: 'Beta Corp', tick_size: 5 }
const instruments = [SYNTH_DEF, BETA]

describe('filterInstruments', () => {
  it('returns everything for an empty query', () => {
    expect(filterInstruments(instruments, '')).toEqual(instruments)
    expect(filterInstruments(instruments, '   ')).toEqual(instruments)
  })

  it('matches by id, case-insensitively', () => {
    expect(filterInstruments(instruments, 'Synth Def')).toEqual([SYNTH_DEF])
    expect(filterInstruments(instruments, 'BETA')).toEqual([BETA])
  })

  it('matches by name, case-insensitively', () => {
    expect(filterInstruments(instruments, 'corp')).toEqual([BETA])
    expect(filterInstruments(instruments, 'industries')).toEqual([SYNTH_DEF])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterInstruments(instruments, 'zzz')).toEqual([])
  })
})
