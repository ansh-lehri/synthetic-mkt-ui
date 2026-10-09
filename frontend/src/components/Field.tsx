import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label: string
  hint?: ReactNode
  /** Error message. Shown with a "!" so it isn't colour alone. */
  error?: string
  /** Numbers (qty, price): mono tabular face + decimal keyboard on phones. */
  numeric?: boolean
  /** Trailing adornment inside the input (a unit, or ± buttons). */
  suffix?: ReactNode
  /** Leading adornment inside the input. */
  prefix?: ReactNode
}

/** Labelled input. Label, hint and error are wired with htmlFor / aria-describedby / aria-invalid. */
export function Field({ label, hint, error, numeric = false, suffix, prefix, className, id, ...rest }: FieldProps) {
  const auto = useId()
  const inputId = id ?? auto
  const hintId = `${inputId}-hint`
  const errId = `${inputId}-err`
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      <div
        className={cx(
          'flex items-stretch overflow-hidden rounded-md border bg-surface-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
          error ? 'border-sell border-2' : 'border-line',
        )}
      >
        {prefix && <span className="flex items-center pl-3 text-sm text-muted">{prefix}</span>}
        <input
          {...rest}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          inputMode={rest.inputMode ?? (numeric ? 'decimal' : undefined)}
          className={cx(
            'min-h-[44px] min-w-0 flex-1 bg-transparent px-3 text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:text-muted',
            numeric ? 'font-mono tabular-nums text-sm' : 'text-sm',
          )}
        />
        {suffix && <span className="flex items-center pr-1 text-sm text-muted">{suffix}</span>}
      </div>
      {error && (
        <p id={errId} className="mt-1 flex gap-1 text-xs text-sell">
          <span aria-hidden="true">!</span>
          <span>{error}</span>
        </p>
      )}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
