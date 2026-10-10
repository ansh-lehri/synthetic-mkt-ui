import { useId, type ReactElement, type ReactNode } from 'react'

/**
 * Hover / keyboard-focus tooltip. The trigger gets aria-describedby wired by the caller
 * through the render prop, so the reason is announced, not just shown.
 * Used for capability-disabled controls ("why can't I click this?").
 */
export function Tooltip({
  text,
  children,
  className = '',
}: {
  /** Tooltip content. When null/empty nothing is rendered. */
  text?: ReactNode
  children: (describedBy: string | undefined) => ReactElement
  className?: string
}) {
  const id = useId()
  if (!text) return children(undefined)
  return (
    <span className={`group relative inline-flex ${className}`}>
      {children(id)}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-max max-w-[16rem] -translate-x-1/2 rounded-sm border border-line bg-raised px-3 py-2 text-xs text-ink shadow-card group-focus-within:block group-hover:block"
      >
        {text}
      </span>
    </span>
  )
}
