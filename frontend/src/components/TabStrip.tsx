import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface TabDef {
  id: string
  label: string
  /** Optional count badge (open orders, trades…). */
  count?: number
  /** `degraded` greys the tab and marks it (e.g. trades_degraded) — it stays usable. */
  status?: 'degraded'
}

export interface TabStripProps {
  tabs: TabDef[]
  activeId: string
  onChange: (id: string) => void
  /** Accessible name for the tab list. */
  label?: string
  /** Content of the active tab. */
  children?: ReactNode
  className?: string
}

/**
 * Positions / Open orders / Trades / Session P&L (the Terminal bottom). ARIA tabs with
 * arrow-key / Home / End navigation. The strip scrolls sideways on its own at phone width —
 * the page never does.
 */
export function TabStrip({ tabs, activeId, onChange, label = 'Account', children, className }: TabStripProps) {
  const base = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const move = (to: number) => {
    const i = (to + tabs.length) % tabs.length
    onChange(tabs[i].id)
    refs.current[i]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') move(index + 1)
    else if (e.key === 'ArrowLeft') move(index - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(tabs.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b border-line">
        {tabs.map((t, i) => {
          const active = t.id === activeId
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={active}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx(
                '-mb-px inline-flex min-h-[44px] shrink-0 items-center gap-2 border-b-2 px-4 text-sm',
                active ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink',
                t.status === 'degraded' && 'opacity-70',
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="rounded-pill border border-line px-2 tnum text-xs text-muted">{t.count}</span>
              )}
              {t.status === 'degraded' && (
                <>
                  <span aria-hidden="true" className="text-ink">
                    !
                  </span>
                  <span className="sr-only">(data degraded)</span>
                </>
              )}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel-${activeId}`} aria-labelledby={`${base}-tab-${activeId}`} tabIndex={0}>
        {children}
      </div>
    </div>
  )
}
