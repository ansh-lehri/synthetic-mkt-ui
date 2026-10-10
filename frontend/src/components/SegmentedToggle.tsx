import { cx } from '../lib/cx'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedToggleProps<T extends string> {
  options: Array<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  /** Accessible name of the group. */
  label: string
  className?: string
}

/**
 * The board's pill switch (`.seg`): a row of toggle buttons where exactly one is pressed.
 * The pressed one gets a soft fill + accent ring and heavier text — not colour alone.
 */
export function SegmentedToggle<T extends string>({ options, value, onChange, label, className }: SegmentedToggleProps<T>) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex gap-0.5 rounded-pill border border-line bg-bg p-[3px]', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-[44px] whitespace-nowrap rounded-pill px-4 text-sm',
              on ? 'bg-soft font-semibold text-ink shadow-[inset_0_0_0_1px_var(--accent)]' : 'font-medium text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
