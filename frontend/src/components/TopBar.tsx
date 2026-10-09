import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'

export interface MarketOption {
  code: string
  name: string
}

export interface AccountMenuItem {
  label: string
  onSelect: () => void
}

export interface TopBarProps {
  markets: MarketOption[]
  market: string
  onMarketChange: (code: string) => void
  /** Shown on the account button, e.g. an account id or name. */
  accountLabel: string
  accountItems: AccountMenuItem[]
  /** Override the theme control (defaults to the Night/Lab toggle). */
  themeSlot?: ReactNode
  /** `true` while markets are loading — the dropdown is disabled, not hidden. */
  marketsLoading?: boolean
}

function AccountMenu({ label, items }: { label: string; items: AccountMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    itemRefs.current[0]?.focus()
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const onMenuKey = (e: KeyboardEvent, i: number) => {
    const n = items.length
    if (e.key === 'Escape') {
      setOpen(false)
      ;(root.current?.querySelector('button[aria-haspopup]') as HTMLElement | null)?.focus()
    } else if (e.key === 'ArrowDown') itemRefs.current[(i + 1) % n]?.focus()
    else if (e.key === 'ArrowUp') itemRefs.current[(i - 1 + n) % n]?.focus()
    else if (e.key === 'Home') itemRefs.current[0]?.focus()
    else if (e.key === 'End') itemRefs.current[n - 1]?.focus()
    else return
    e.preventDefault()
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-line bg-surface-raised px-4 text-sm text-ink hover:bg-surface"
      >
        <span aria-hidden="true">◉</span>
        <span className="max-w-[10rem] truncate">{label}</span>
        <span aria-hidden="true" className="text-xs text-muted">
          ▾
        </span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-30 mt-2 min-w-[12rem] rounded-md border border-line bg-surface p-1 shadow-lg"
        >
          {items.map((it, i) => (
            <button
              key={it.label}
              ref={(el) => {
                itemRefs.current[i] = el
              }}
              role="menuitem"
              type="button"
              onKeyDown={(e) => onMenuKey(e, i)}
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
              className="flex min-h-[44px] w-full items-center rounded-sm px-3 text-left text-sm text-ink hover:bg-surface-raised"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * App name + persistent [Simulation] tag + global market dropdown + theme toggle + account
 * menu. Present on every in-app screen. Wraps (never scrolls the page) at phone width.
 */
export function TopBar({ markets, market, onMarketChange, accountLabel, accountItems, themeSlot, marketsLoading = false }: TopBarProps) {
  const selectId = useId()
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold">Market Simulator</span>
        <span className="inline-flex items-center gap-1 rounded-pill border border-signal bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-signal" />
          Simulation
        </span>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="text-sm text-muted">
            Market
          </label>
          <select
            id={selectId}
            value={market}
            disabled={marketsLoading || markets.length === 0}
            onChange={(e) => onMarketChange(e.target.value)}
            className="min-h-[44px] rounded-md border border-line bg-surface-raised px-3 text-sm text-ink disabled:cursor-not-allowed disabled:text-muted"
          >
            {marketsLoading && <option value="">Loading…</option>}
            {markets.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>
        </div>
        {themeSlot ?? <ThemeToggle />}
        <AccountMenu label={accountLabel} items={accountItems} />
      </div>
    </header>
  )
}
