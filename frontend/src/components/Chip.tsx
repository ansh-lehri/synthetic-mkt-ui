import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  selected?: boolean
  children: ReactNode
}

/** Small pill toggle (market picker, condition picker). Selected is shown by a ✓ and a heavier border, not colour alone. */
export function Chip({ selected = false, className, type = 'button', children, ...rest }: ChipProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-[44px] items-center gap-2 rounded-pill border px-4 text-sm transition-colors',
        selected
          ? 'border-signal border-2 bg-surface-raised font-semibold text-ink'
          : 'border-line bg-transparent text-muted hover:bg-surface-raised hover:text-ink',
        rest.disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {selected && <span aria-hidden="true">✓</span>}
      {children}
    </button>
  )
}
