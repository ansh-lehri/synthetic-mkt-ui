import { useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { checkTicket, estimateCost, type OrderType, type Side, type TicketInstrument } from '../lib/orderTicket'
import { formatPrice, snapToTick, stepPrice } from '../lib/ticks'
import { Banner } from './Banner'
import { Button, type Capability } from './Button'
import { Card } from './Card'
import { Field } from './Field'
import { Num } from './Num'
import { Tooltip } from './Tooltip'

/** What the ticket hands to the caller; maps 1:1 onto `PlaceOrderRequest` (minus account_id). */
export interface OrderDraft {
  instrument: string
  side: Side
  type: OrderType
  tif: 'gtc' | 'ioc'
  qty: number
  /** Raw ticks; present for limit orders only. */
  limit_price?: number
}

/** Outcome message to surface under the ticket. 202 is "accepted", never "done". */
export interface TicketFeedback {
  kind: 'accepted' | 'partial' | 'rejected' | 'error'
  message: string
}

export interface OrderTicketProps {
  instrument: TicketInstrument
  /** `capabilities.marketOrders` — Market stays disabled until the backend lights it up (Phase 7). */
  marketOrders: Capability
  /** Cash available to buy with, raw money units. May be negative (debt is legal). */
  buyingPower: number
  /** Latest price, seeds the limit price field. Gate on `has_last`. */
  lastPrice?: number
  hasLast?: boolean
  /** POST in flight — the CTA shows a spinner and ignores clicks. */
  submitting?: boolean
  feedback?: TicketFeedback
  onSubmit: (draft: OrderDraft) => void
  className?: string
}

function Segmented<T extends string>({
  name,
  legend,
  value,
  onChange,
  options,
}: {
  name: string
  legend: string
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string; glyph?: string; tone: string; capability?: Capability }>
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-md border border-line bg-surface-raised p-1">
        {options.map((o) => {
          const gated = o.capability && !o.capability.enabled
          const label: ReactNode = (
            <label className="relative block">
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={value === o.value}
                disabled={gated}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <span
                className={cx(
                  'flex min-h-[44px] items-center justify-center gap-1 rounded-sm px-3 text-sm font-semibold',
                  'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                  gated
                    ? 'cursor-not-allowed text-muted'
                    : value === o.value
                      ? o.tone
                      : 'cursor-pointer text-muted hover:text-ink',
                )}
              >
                {value === o.value && !gated && <span aria-hidden="true">{o.glyph ?? '✓'}</span>}
                {o.label}
              </span>
            </label>
          )
          return gated ? (
            <Tooltip key={o.value} text={o.capability?.reason}>
              {() => label}
            </Tooltip>
          ) : (
            <span key={o.value}>{label}</span>
          )
        })}
      </div>
    </fieldset>
  )
}

function StepButtons({ onStep, what }: { onStep: (d: 1 | -1) => void; what: string }) {
  const cls = 'inline-flex h-11 w-11 items-center justify-center text-lg text-ink hover:bg-surface'
  return (
    <span className="flex items-stretch border-l border-line">
      <button type="button" aria-label={`Decrease ${what}`} onClick={() => onStep(-1)} className={cls}>
        −
      </button>
      <button type="button" aria-label={`Increase ${what}`} onClick={() => onStep(1)} className={cx(cls, 'border-l border-line')}>
        +
      </button>
    </span>
  )
}

/**
 * Buy/Sell, Limit/Market (Market gated), qty ±, limit price ±, est. cost, buying power and
 * the place CTA. Defaults to LIMIT. Validation is exact (lot size, tick grid) and never
 * rounds silently. It never claims success: a `202` is shown as "accepted", not "filled".
 */
export function OrderTicket({
  instrument,
  marketOrders,
  buyingPower,
  lastPrice,
  hasLast = false,
  submitting = false,
  feedback,
  onSubmit,
  className,
}: OrderTicketProps) {
  const [side, setSide] = useState<Side>('buy')
  const [type, setType] = useState<OrderType>('limit')
  const [qtyText, setQtyText] = useState(String(instrument.lot_size))
  const [priceText, setPriceText] = useState(() => {
    const snapped = hasLast && lastPrice !== undefined ? snapToTick(lastPrice, instrument.tick_size) : null
    return snapped === null ? '' : formatPrice(snapped, instrument)
  })
  const [touched, setTouched] = useState<{ qty?: boolean; price?: boolean }>({})

  const check = checkTicket({ qtyText, priceText, type, instrument })
  const cost = estimateCost(check.qty, check.price)
  const overBuyingPower = side === 'buy' && cost !== null && cost > BigInt(Math.max(0, buyingPower))
  const showErr = (k: 'qty' | 'price') => (touched[k] || (k === 'qty' ? qtyText : priceText) !== '' ? check.errors[k] : undefined)

  const stepQty = (d: 1 | -1) => {
    const cur = Number(qtyText)
    const base = Number.isSafeInteger(cur) && cur >= 0 ? cur : 0
    const next = Math.max(instrument.lot_size, base + d * instrument.lot_size)
    setQtyText(String(next - (next % instrument.lot_size)))
  }

  const stepLimit = (d: 1 | -1) => {
    const parsedBase = checkTicket({ qtyText: '1', priceText, type: 'limit', instrument }).price
    const from = parsedBase ?? (hasLast && lastPrice !== undefined ? lastPrice : 0)
    const next = stepPrice(from, instrument.tick_size, d)
    if (next !== null && next > 0) setPriceText(formatPrice(next, instrument))
  }

  const submit = () => {
    if (!check.ok || check.qty === null || submitting) return
    onSubmit({
      instrument: instrument.symbol,
      side,
      type,
      tif: type === 'limit' ? 'gtc' : 'ioc',
      qty: check.qty,
      ...(type === 'limit' && check.price !== null ? { limit_price: check.price } : {}),
    })
  }

  return (
    <Card as="form" title={`Order · ${instrument.symbol}`} className={className} onSubmit={(e) => {
      e.preventDefault()
      submit()
    }}>
      <div className="space-y-4">
        <Segmented<Side>
          name={`side-${instrument.symbol}`}
          legend="Side"
          value={side}
          onChange={setSide}
          options={[
            { value: 'buy', label: 'Buy', glyph: '▲', tone: 'bg-buy text-buy-ink' },
            { value: 'sell', label: 'Sell', glyph: '▼', tone: 'bg-sell text-sell-ink' },
          ]}
        />
        <Segmented<OrderType>
          name={`type-${instrument.symbol}`}
          legend="Order type"
          value={type}
          onChange={setType}
          options={[
            { value: 'limit', label: 'Limit', tone: 'bg-surface text-ink border border-line' },
            { value: 'market', label: 'Market', tone: 'bg-surface text-ink border border-line', capability: marketOrders },
          ]}
        />
        {!marketOrders.enabled && <p className="-mt-2 text-xs text-muted">{marketOrders.reason}</p>}

        <Field
          label={`Quantity (lot ${instrument.lot_size})`}
          numeric
          value={qtyText}
          error={showErr('qty')}
          onChange={(e) => setQtyText(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, qty: true }))}
          suffix={<StepButtons onStep={stepQty} what="quantity" />}
          autoComplete="off"
        />

        {type === 'limit' ? (
          <Field
            label="Limit price"
            numeric
            value={priceText}
            error={showErr('price')}
            hint={`Tick ${formatPrice(instrument.tick_size, instrument)}`}
            onChange={(e) => setPriceText(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, price: true }))}
            suffix={<StepButtons onStep={stepLimit} what="limit price" />}
            autoComplete="off"
          />
        ) : (
          <p className="rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-muted">
            Fills at the best available price; no cost estimate.
          </p>
        )}

        <dl className="space-y-1 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted">Est. cost</dt>
            <dd>
              <Num kind="money" value={cost ?? 0} available={cost !== null} />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted">Buying power</dt>
            <dd>
              <Num kind="money" value={buyingPower} />
            </dd>
          </div>
        </dl>

        {overBuyingPower && (
          <Banner tone="warn">Estimated cost is above your buying power; the exchange may reject this order.</Banner>
        )}

        <Button type="submit" variant={side === 'buy' ? 'buy' : 'sell'} fullWidth loading={submitting} disabled={!check.ok}>
          {side === 'buy' ? 'Buy' : 'Sell'} {instrument.symbol}
        </Button>

        {feedback && (
          <Banner
            tone={feedback.kind === 'accepted' ? 'info' : feedback.kind === 'partial' ? 'warn' : 'error'}
            title={
              feedback.kind === 'accepted'
                ? 'Order accepted'
                : feedback.kind === 'partial'
                  ? 'Order partly filled'
                  : feedback.kind === 'rejected'
                    ? 'Order rejected'
                    : 'Something went wrong'
            }
          >
            {feedback.message}
            {feedback.kind === 'accepted' && ' Accepted is not filled — check Open orders and Trades for the outcome.'}
          </Banner>
        )}
      </div>
    </Card>
  )
}
