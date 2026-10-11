import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

export type BannerTone = 'info' | 'warn' | 'error' | 'success'

const TONE: Record<BannerTone, { box: string; icon: string; glyph: string; label: string }> = {
  info: { box: 'border-line bg-raised', icon: 'text-ink', glyph: 'ⓘ', label: 'Info' },
  warn: { box: 'border-warnLine bg-warnBg', icon: 'text-ink', glyph: '⚠', label: 'Warning' },
  error: { box: 'border-loss bg-lossBg', icon: 'text-loss', glyph: '✕', label: 'Error' },
  success: { box: 'border-gain bg-gainBg', icon: 'text-gain', glyph: '✓', label: 'Success' },
}

export interface BannerProps {
  tone?: BannerTone
  title?: ReactNode
  children?: ReactNode
  /** Right-aligned action (a Button). */
  action?: ReactNode
  onDismiss?: () => void
  className?: string
}

/**
 * Inline status: halt = warn, practice = "not recorded" (info), failure = error.
 * Every tone carries an icon + a screen-reader label, so meaning isn't colour alone.
 * Errors and warnings are announced immediately (role=alert); the rest politely (role=status).
 */
export function Banner({ tone = 'info', title, children, action, onDismiss, className }: BannerProps) {
  const t = TONE[tone]
  return (
    <div
      role={tone === 'error' || tone === 'warn' ? 'alert' : 'status'}
      className={cx('flex flex-wrap gap-3 rounded-md border px-4 py-3 text-sm text-ink', action && !children ? 'items-center' : 'items-start', t.box, className)}
    >
      <span aria-hidden="true" className={cx('mt-0.5 font-bold', t.icon)}>
        {t.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{t.label}: </span>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5 text-muted')}>{children}</div>}
      </div>
      {action}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-my-2 -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-panel"
        >
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </div>
  )
}

/** A roomier, stacked status block for full-width states (e.g. "Trading halted"). */
export function Panel({ tone = 'info', title, children, action, className }: Omit<BannerProps, 'onDismiss'>) {
  const t = TONE[tone]
  return (
    <section
      role={tone === 'error' || tone === 'warn' ? 'alert' : 'status'}
      className={cx('rounded-lg border p-5 text-ink', t.box, className)}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={cx('text-lg font-bold', t.icon)}>
          {t.glyph}
        </span>
        <span className="sr-only">{t.label}: </span>
        {title && <h3 className="text-base font-semibold">{title}</h3>}
      </div>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </section>
  )
}
