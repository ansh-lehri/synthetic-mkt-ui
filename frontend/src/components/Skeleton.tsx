import { cx } from '../lib/cx'

/** Placeholder block shown while real content loads. Purely visual (aria-hidden). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('block animate-pulse rounded-sm bg-raised motion-reduce:animate-none', className ?? 'h-4 w-full')}
    />
  )
}

/** A few text-line skeletons, the last one shorter. Announces loading once for screen readers. */
export function SkeletonText({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? 'h-4 w-2/3' : 'h-4 w-full'} />
      ))}
    </div>
  )
}
