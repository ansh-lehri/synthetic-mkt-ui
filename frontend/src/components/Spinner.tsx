import { cx } from '../lib/cx'

/** Honest "working on it" indicator — no fake progress steps. */
export function Spinner({ label = 'Loading', size = 20, className }: { label?: string; size?: number; className?: string }) {
  return (
    <span role="status" className={cx('inline-flex items-center', className)}>
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="inline-block animate-spin rounded-pill border-2 border-line border-t-signal motion-reduce:animate-none"
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}
