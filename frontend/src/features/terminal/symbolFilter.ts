import type { Instrument } from '../../api'
import { instrumentName } from '../../lib/instrumentDefaults'

/** Pure filter for the symbol search combobox: id or name containing the query (case-insensitive). */
export function filterInstruments(instruments: Instrument[], query: string): Instrument[] {
  const q = query.trim().toLowerCase()
  if (!q) return instruments
  return instruments.filter((i) => i.id.toLowerCase().includes(q) || instrumentName(i).toLowerCase().includes(q))
}
