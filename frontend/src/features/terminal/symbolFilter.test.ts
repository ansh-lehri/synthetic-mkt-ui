import { describe, expect, it } from 'vitest'
import type { Instrument } from '../../api'
import { filterInstruments } from './symbolFilter'

const ACME: Instrument = { id: 'ACME', name: 'Acme Industries', tick_size: 5 }
const BETA: Instrument = { id: 'BETA', name: 'Beta Corp', tick_size: 5 }
const instruments = [ACME, BETA]

describe('filterInstruments', () => {
  it('returns everything for an empty query', () => {
    expect(filterInstruments(instruments, '')).toEqual(instruments)
    expect(filterInstruments(instruments, '   ')).toEqual(instruments)
  })

  it('matches by id, case-insensitively', () => {
    expect(filterInstruments(instruments, 'acme')).toEqual([ACME])
    expect(filterInstruments(instruments, 'BETA')).toEqual([BETA])
  })

  it('matches by name, case-insensitively', () => {
    expect(filterInstruments(instruments, 'corp')).toEqual([BETA])
    expect(filterInstruments(instruments, 'industries')).toEqual([ACME])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterInstruments(instruments, 'zzz')).toEqual([])
  })
})
