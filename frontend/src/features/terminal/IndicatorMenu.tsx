import { useEffect, useId, useRef, useState } from 'react'
import { Tooltip } from '../../components'
import { cx } from '../../lib/cx'
import { DEFAULT_CALC_PARAMS } from './indicatorDefaults'
import { INDICATOR_INFO } from './formationInfo'

export interface IndicatorEntry {
  name: string
  label: string
}

export const MAIN_PANE_CATALOG: IndicatorEntry[] = [
  { name: 'MA', label: 'Moving Average' },
  { name: 'EMA', label: 'EMA' },
  { name: 'SMA', label: 'SMA (second)' },
  { name: 'BBI', label: 'BBI' },
  { name: 'BOLL', label: 'Bollinger Bands' },
  { name: 'SAR', label: 'Parabolic SAR' },
]

export const OSCILLATOR_CATALOG: IndicatorEntry[] = [
  { name: 'MACD', label: 'MACD' },
  { name: 'RSI', label: 'RSI' },
  { name: 'KDJ', label: 'Stochastic (KDJ)' },
  { name: 'CCI', label: 'CCI' },
  { name: 'WR', label: 'Williams %R' },
  { name: 'BIAS', label: 'BIAS' },
  { name: 'BRAR', label: 'BRAR' },
  { name: 'CR', label: 'CR' },
  { name: 'DMA', label: 'DMA' },
  { name: 'DMI', label: 'DMI / ADX' },
  { name: 'EMV', label: 'Ease of Movement' },
  { name: 'MTM', label: 'Momentum' },
  { name: 'OBV', label: 'On Balance Volume' },
  { name: 'PSY', label: 'Psychological Line' },
  { name: 'PVT', label: 'Price-Volume Trend' },
  { name: 'ROC', label: 'Rate of Change' },
  { name: 'TRIX', label: 'TRIX' },
  { name: 'VR', label: 'Volume Ratio' },
  { name: 'AO', label: 'Awesome Oscillator' },
  { name: 'AVP', label: 'Average Price' },
  { name: 'VOL', label: 'Volume' },
  { name: 'AROON', label: 'Aroon' },
  { name: 'AD', label: 'Accumulation/Distribution' },
]

export interface IndicatorMenuProps {
  active: string[]
  onAdd: (name: string, calcParams?: number[]) => void
  onRemove: (name: string) => void
}

function filterCatalog(catalog: IndicatorEntry[], query: string): IndicatorEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return catalog
  return catalog.filter((e) => e.name.toLowerCase().includes(q) || e.label.toLowerCase().includes(q))
}

export function IndicatorMenu({ active, onAdd, onRemove }: IndicatorMenuProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    setQuery('')
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (entry: IndicatorEntry) => {
    if (active.includes(entry.name)) onRemove(entry.name)
    else onAdd(entry.name, DEFAULT_CALC_PARAMS[entry.name])
  }

  const mains = filterCatalog(MAIN_PANE_CATALOG, query)
  const oscillators = filterCatalog(OSCILLATOR_CATALOG, query)

  const row = (entry: IndicatorEntry) => (
    <Tooltip key={entry.name} text={INDICATOR_INFO[entry.name]}>
      {(describedBy) => (
        <button
          type="button"
          aria-describedby={describedBy}
          aria-pressed={active.includes(entry.name)}
          onClick={() => toggle(entry)}
          className={cx(
            'flex min-h-[40px] w-full items-center justify-between rounded-sm px-2 py-1 text-left text-sm',
            active.includes(entry.name) ? 'bg-soft font-semibold text-ink' : 'text-ink hover:bg-raised',
          )}
        >
          <span>{entry.label}</span>
          {active.includes(entry.name) && <span aria-hidden="true">✓</span>}
        </button>
      )}
    </Tooltip>
  )

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] items-center gap-2 rounded-md border border-line bg-raised px-3 text-sm text-ink hover:bg-panel"
      >
        <span aria-hidden="true">📈</span>
        <span>Indicators</span>
        <span aria-hidden="true" className="text-xs text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-72 rounded-md border border-line bg-panel p-2 shadow-card">
          <input
            type="text"
            placeholder="Search indicators…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-[36px] w-full rounded-sm border border-line bg-raised px-2 text-sm text-ink outline-none placeholder:text-muted focus:outline-2 focus:outline-offset-2 focus:outline-focus"
          />
          <div id={listId} className="mt-2 flex max-h-72 flex-col gap-3 overflow-y-auto">
            {mains.length > 0 && (
              <div className="flex flex-col">
                <p className="px-2 pb-1 text-xs font-semibold uppercase text-muted">Overlays (main pane)</p>
                {mains.map(row)}
              </div>
            )}
            {oscillators.length > 0 && (
              <div className="flex flex-col">
                <p className="px-2 pb-1 text-xs font-semibold uppercase text-muted">Oscillators</p>
                {oscillators.map(row)}
              </div>
            )}
            {mains.length === 0 && oscillators.length === 0 && <p className="px-2 py-2 text-sm text-muted">No matches</p>}
          </div>
        </div>
      )}
    </div>
  )
}
