import { useEffect, useId, useRef, useState } from 'react'
import type { Instrument, OpenOrder } from '../../api'
import { Button, Field } from '../../components'
import { checkTicket } from '../../lib/orderTicket'
import { formatPrice } from '../../lib/ticks'

/**
 * Modify a resting limit order: new quantity and price. It is a cancel + replace on the
 * exchange, so the confirm text says so — and that you can end up with no order.
 */
export function ModifyDialog({
  order,
  instrument,
  onSubmit,
  onCancel,
}: {
  order: OpenOrder | null
  instrument: Instrument | undefined
  onSubmit: (req: { order_id: string; instrument: string; side: 'buy' | 'sell'; is_market: false; new_qty: number; new_price: number }) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (order && !dlg.open) dlg.showModal()
    if (!order && dlg.open) dlg.close()
  }, [order])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel()
      }}
      className="fixed inset-0 !m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-panel p-0 text-ink shadow-card"
    >
      {/* keyed per order, so the fields start from that order's own values */}
      {order && instrument && <ModifyForm key={order.order_id} order={order} instrument={instrument} titleId={titleId} onSubmit={onSubmit} onCancel={onCancel} />}
    </dialog>
  )
}

function ModifyForm({
  order, instrument, titleId, onSubmit, onCancel,
}: {
  order: OpenOrder
  instrument: Instrument
  titleId: string
  onSubmit: Parameters<typeof ModifyDialog>[0]['onSubmit']
  onCancel: () => void
}) {
  const fmt = { tick_size: instrument.tick_size, price_decimals: instrument.price_decimals ?? 2, symbol: instrument.id, lot_size: instrument.lot_size ?? 1 }
  const [qtyText, setQtyText] = useState(String(order.orig_qty))
  const [priceText, setPriceText] = useState(formatPrice(order.limit_price, fmt))
  const check = checkTicket({ qtyText, priceText, type: 'limit', instrument: fmt })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!check.ok || check.qty === null || check.price === null) return
        onSubmit({ order_id: order.order_id, instrument: order.instrument, side: order.side === 'sell' ? 'sell' : 'buy', is_market: false, new_qty: check.qty, new_price: check.price })
      }}
    >
      <div className="space-y-4 p-5">
        <h2 id={titleId} className="text-base font-semibold">Modify {order.side === 'buy' ? 'buy' : 'sell'} order · {order.instrument}</h2>
        <p className="text-sm text-muted">
          This cancels the order and places a new one. If the new order is refused you will be left with no order.
        </p>
        <Field label={`Quantity (lot ${fmt.lot_size})`} numeric value={qtyText} error={check.errors.qty} onChange={(e) => setQtyText(e.target.value)} autoComplete="off" />
        <Field label="Limit price" numeric value={priceText} error={check.errors.price} onChange={(e) => setPriceText(e.target.value)} autoComplete="off" />
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">
        <Button variant="ghost" onClick={onCancel}>Keep as is</Button>
        <Button type="submit" variant="primary" disabled={!check.ok}>Replace order</Button>
      </div>
    </form>
  )
}
