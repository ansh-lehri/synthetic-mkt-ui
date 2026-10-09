import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Rendered element. Default `div`; use `section` + a title for landmarks. */
  as?: ElementType
  title?: ReactNode
  /** Right-aligned header content (buttons, status). */
  actions?: ReactNode
  /** Remove body padding (tables, ladders that run edge to edge). */
  flush?: boolean
  children?: ReactNode
}

/** Base surface panel: `--line` border, `--r-lg` radius. */
export function Card({ as: Tag = 'div', title, actions, flush = false, className, children, ...rest }: CardProps) {
  return (
    <Tag {...rest} className={cx('rounded-lg border border-line bg-surface text-ink', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </Tag>
  )
}
