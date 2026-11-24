import { useEffect, useId, useRef, useState } from 'react'
import type { Instrument } from '../../api'
import { instrumentName } from '../../lib/instrumentDefaults'
import { cx } from '../../lib/cx'
import { filterInstruments } from './symbolFilter'

export interface SymbolSearchProps {
  instruments: Instrument[]
  value: string
  onChange: (symbol: string) => void
}

/**
 * Type-to-filter symbol picker, replacing the plain instrument `<select>`. A trigger
 * button shows the current symbol; opening it reveals a text filter + listbox.
 */
export function SymbolSearch({ instruments, value, onChange }: SymbolSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const filtered = filterInstruments(instruments, query)
  const current = instruments.find((i) => i.id === value)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    inputRef.current?.focus()
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (symbol: string) => {
    onChange(symbol)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[active]) pick(filtered[active].id)
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] items-center gap-2 rounded-md border border-line bg-raised px-3 text-sm text-ink hover:bg-panel"
      >
        <span aria-hidden="true" className="text-muted">🔍</span>
        <span className="font-semibold">{current?.id ?? value}</span>
        <span aria-hidden="true" className="text-xs text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-64 rounded-md border border-line bg-panel p-2 shadow-card">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            placeholder="Search symbol…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            className="min-h-[36px] w-full rounded-sm border border-line bg-raised px-2 text-sm text-ink outline-none placeholder:text-muted focus:outline-2 focus:outline-offset-2 focus:outline-focus"
          />
          <ul id={listId} role="listbox" className="mt-2 max-h-56 overflow-y-auto">
            {filtered.length === 0 && <li className="px-2 py-2 text-sm text-muted">No matches</li>}
            {filtered.map((i, idx) => (
              <li key={i.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i.id === value}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => pick(i.id)}
                  className={cx(
                    'flex min-h-[40px] w-full flex-col items-start rounded-sm px-2 py-1 text-left',
                    idx === active ? 'bg-soft' : 'hover:bg-raised',
                  )}
                >
                  <span className="text-sm font-semibold text-ink">{i.id}</span>
                  <span className="text-xs text-muted">{instrumentName(i)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
