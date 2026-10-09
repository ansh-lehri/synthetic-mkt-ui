import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { cx } from '../lib/cx'
import { Spinner } from './Spinner'
import { Tooltip } from './Tooltip'

export type ButtonVariant = 'primary' | 'buy' | 'sell' | 'exit' | 'ghost'

/** A feature gated by a capability flag (e.g. `capabilities.marketOrders`). */
export interface Capability {
  enabled: boolean
  /** Why it's unavailable — shown in a tooltip and announced to screen readers. */
  reason: string
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  /** Capability gate. When `enabled` is false the button is inert but stays focusable so the reason is reachable. */
  capability?: Capability
  /** Shows a spinner and blocks clicks (e.g. while a POST is in flight). */
  loading?: boolean
  fullWidth?: boolean
  children: ReactNode
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-signal text-signal-ink hover:brightness-95 border-transparent',
  buy: 'bg-buy text-buy-ink hover:brightness-95 border-transparent',
  sell: 'bg-sell text-sell-ink hover:brightness-95 border-transparent',
  // Exit is red but outlined, so it reads as "leave" rather than a second Sell.
  exit: 'bg-transparent text-sell border-sell hover:bg-sell-soft',
  ghost: 'bg-transparent text-ink border-line hover:bg-surface-raised',
}

const DISABLED = 'bg-surface-raised text-muted border-line cursor-not-allowed'

/** The one button. Coloured primaries, 44px minimum target, visible focus ring (global). */
export function Button({
  variant = 'primary',
  capability,
  loading = false,
  fullWidth = false,
  disabled = false,
  type = 'button',
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const gated = capability !== undefined && !capability.enabled
  const inert = disabled || gated || loading

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // aria-disabled (not `disabled`) for gated/loading so the button stays focusable.
    if (gated || loading) {
      e.preventDefault()
      return
    }
    onClick?.(e)
  }

  const button = (describedBy?: string) => (
    <button
      {...rest}
      type={type}
      // Truly disabled controls use the native attribute; gated/loading ones stay focusable.
      disabled={disabled}
      aria-disabled={gated || loading || undefined}
      aria-busy={loading || undefined}
      aria-describedby={describedBy ?? rest['aria-describedby']}
      onClick={handleClick}
      className={cx(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors',
        inert ? DISABLED : VARIANT[variant],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading && <Spinner size={16} label="Working" />}
      {children}
    </button>
  )

  return gated ? <Tooltip text={capability.reason}>{(id) => button(id)}</Tooltip> : button()
}
