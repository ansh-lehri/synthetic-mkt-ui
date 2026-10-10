import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface EmptyStateProps {
  title: string
  description?: ReactNode
  /** A glyph (decorative). Default "∅". */
  icon?: string
  action?: ReactNode
  /** Greyed-out variant for degraded data (e.g. `trades_degraded`) — the screen stays up. */
  degraded?: boolean
  className?: string
}

/** "No trades yet", "Flat", or a degraded strip. */
export function EmptyState({ title, description, icon = '∅', action, degraded = false, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center gap-2 px-4 py-8 text-center', degraded && 'opacity-80', className)}>
      <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-pill border border-line text-lg text-muted">
        {degraded ? '!' : icon}
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
