import {
  UNITS_LABEL,
  formatMoney,
  formatPrice,
  formatQty,
  moneyChange,
  percentChange,
  priceChange,
  type Change,
  type Direction,
  type Int,
  type PriceFormat,
} from '../lib/ticks'
import { cx } from '../lib/cx'

type Size = 'sm' | 'md' | 'lg' | 'xl'

interface Common {
  /**
   * Gate for optional numerics (`has_bid`, `has_last`, `mark_available`…). When false the
   * value is not shown — a "—" is — because 0 is a valid price and must never stand in for "absent".
   */
  available?: boolean
  size?: Size
  className?: string
}

export type NumProps = Common &
  (
    | { kind: 'price'; value: Int; fmt: PriceFormat; group?: boolean }
    | { kind: 'price-change'; value: Int; fmt: PriceFormat }
    | { kind: 'money'; value: Int; label?: boolean }
    | { kind: 'signed-money'; value: Int; label?: boolean }
    | { kind: 'percent'; value: number; decimals?: number }
    | { kind: 'qty'; value: Int }
  )

const SIZE: Record<Size, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-lg', xl: 'text-2xl' }

const TONE: Record<Direction, string> = { up: 'text-buy', down: 'text-sell', flat: 'text-neutral' }
const GLYPH: Record<Direction, string> = { up: '▲', down: '▼', flat: '•' }
const WORD: Record<Direction, string> = { up: 'up', down: 'down', flat: 'unchanged' }

/**
 * THE numeric display primitive — the only thing in the app that shows a number. Renders
 * through the tick formatter in a tabular mono face. Signed kinds pair colour with ▲/▼ and
 * +/− (text carries the sign, so colour is never the only cue).
 */
export function Num(props: NumProps) {
  const { available = true, size = 'md', className } = props
  const base = cx('font-mono tabular-nums whitespace-nowrap', SIZE[size], className)

  if (!available) {
    return (
      <span className={cx(base, 'text-muted')}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Not available</span>
      </span>
    )
  }

  let change: Change | null = null
  let text: string
  switch (props.kind) {
    case 'price':
      text = formatPrice(props.value, props.fmt, { group: props.group })
      break
    case 'price-change':
      change = priceChange(props.value, props.fmt)
      text = change.text
      break
    case 'money':
      text = formatMoney(props.value, { label: props.label })
      break
    case 'signed-money':
      change = moneyChange(props.value, { label: props.label })
      text = change.text
      break
    case 'percent':
      change = percentChange(props.value, { decimals: props.decimals })
      text = change.text
      break
    case 'qty':
      text = formatQty(props.value)
      break
  }

  if (!change) {
    // Money keeps the "units" label small and muted so the figure stays the focus.
    if (props.kind === 'money' && (props.label ?? true) && text.endsWith(` ${UNITS_LABEL}`)) {
      return (
        <span className={cx(base, 'text-ink')}>
          {text.slice(0, -UNITS_LABEL.length - 1)} <span className="text-[0.8em] text-muted">{UNITS_LABEL}</span>
        </span>
      )
    }
    return <span className={cx(base, 'text-ink')}>{text}</span>
  }

  const unitsSplit = text.endsWith(` ${UNITS_LABEL}`)
  return (
    <span className={cx(base, 'inline-flex items-baseline gap-1', TONE[change.direction])}>
      <span aria-hidden="true" className="text-[0.75em]">
        {GLYPH[change.direction]}
      </span>
      <span className="sr-only">{WORD[change.direction]} </span>
      <span>
        {unitsSplit ? text.slice(0, -UNITS_LABEL.length - 1) : text}
        {unitsSplit && <span className="text-[0.8em] text-muted"> {UNITS_LABEL}</span>}
      </span>
    </span>
  )
}
