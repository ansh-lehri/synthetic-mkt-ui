import { useEffect, useRef } from 'react'
import type { Instrument, Observation } from '../../api'
import { Banner, Num, OrderTicket } from '../../components'
import { marketOrdersCapability } from '../../lib/capabilities'
import type { Side } from '../../lib/orderTicket'
import { useMarketStore } from '../../lib/marketStore'
import type { OrderProgress } from '../../lib/orderFlow'
import type { OrderEntry } from './useOrderEntry'

export interface OrderDrawerState {
  side: Side
  symbol: string
  /** Bumped on every open so the ticket's inputs reset. */
  n: number
}

const PROGRESS_COPY = (p: OrderProgress) => {
  switch (p.state) {
    case 'working':
      return { tone: 'info' as const, title: 'Working', body: `0 of ${p.qty} filled. It is resting on the book; this updates by itself.` }
    case 'partial':
      return { tone: 'warn' as const, title: 'Partly filled', body: `${p.filled} of ${p.qty} filled. The rest is still working.` }
    case 'cancelling':
      return { tone: 'info' as const, title: 'Cancelling', body: 'The cancel has been accepted and has not landed yet.' }
    case 'filled':
      return {
        tone: 'success' as const,
        title: 'Filled',
        body: `All ${p.qty} filled. See Positions. A Trade appears once a position is closed out.`,
      }
    case 'gone':
      return {
        tone: 'warn' as const,
        title: 'No longer on the book',
        body: 'It left the book without a fill we could see — it may have been cancelled or refused. Check Positions and Trades.',
      }
  }
}

/**
 * The order window — the board's right-hand drawer (Buy/Sell, instrument, current price, quantity,
 * type, price, est. cost, place). Built on the native <dialog>, so focus is trapped and Esc closes.
 * It stays open after placing so the order can be watched working -> filled via the poll.
 */
export function OrderDrawer({
  state,
  instruments,
  obs,
  blockedReason,
  entry,
  onSymbol,
  onClose,
}: {
  state: OrderDrawerState | null
  instruments: Instrument[]
  obs: Observation | undefined
  /** Why ordering is off right now (no session, market closed), or undefined. */
  blockedReason: string | undefined
  entry: OrderEntry
  onSymbol: (symbol: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const open = state !== null
  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    if (!open && dlg.open) dlg.close()
  }, [open])

  const snap = useMarketStore((s) => (state ? s.snapshots[state.symbol] : undefined))
  const inst = state ? instruments.find((i) => i.instrument === state.symbol) : undefined
  const fmt = inst ? { tick_size: inst.tick_size, price_decimals: inst.price_decimals } : null
  const progress = entry.progress && PROGRESS_COPY(entry.progress)

  return (
    <dialog
      ref={ref}
      aria-labelledby="order-drawer-h"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="fixed inset-y-0 !m-0 !ml-auto h-full max-h-none w-full max-w-[26rem] border-l border-line bg-panel p-0 text-ink shadow-card backdrop:bg-[var(--scrim)]"
    >
      {state && inst && fmt && (
        <div className="flex h-full flex-col overflow-y-auto">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 id="order-drawer-h" className="text-base font-semibold">New order</h2>
            <button
              type="button"
              aria-label="Close order window"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div className="space-y-4 p-4">
            <div>
              <label htmlFor="order-sym" className="mb-1 block text-xs font-medium text-muted">Instrument</label>
              <select
                id="order-sym"
                value={state.symbol}
                onChange={(e) => onSymbol(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-line bg-raised px-3 text-sm text-ink"
              >
                {instruments.map((i) => (
                  <option key={i.instrument} value={i.instrument}>{i.instrument}  {i.name}</option>
                ))}
              </select>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">Current price</span>
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-3xl font-semibold">
                  <Num kind="price" value={snap?.last_price ?? 0} fmt={fmt} available={!!snap && snap.has_last} size="xl" />
                </span>
                <span className="font-semibold">
                  <Num kind="percent" value={snap?.change_pct ?? 0} available={!!snap && snap.has_last} />
                </span>
              </span>
            </div>

            <OrderTicket
              key={`${state.n}-${state.symbol}`}
              instrument={{ symbol: inst.instrument, tick_size: inst.tick_size, price_decimals: inst.price_decimals, lot_size: inst.lot_size }}
              marketOrders={marketOrdersCapability}
              buyingPower={obs?.balance.available ?? 0}
              lastPrice={snap?.last_price}
              hasLast={!!snap?.has_last}
              initialSide={state.side}
              blocked={blockedReason}
              submitting={entry.submitting}
              feedback={entry.feedback}
              onSubmit={entry.submit}
            />

            {progress && (
              <Banner tone={progress.tone} title={`${entry.placed?.orderId ?? 'Order'} · ${progress.title}`}>
                {progress.body}
              </Banner>
            )}
          </div>
        </div>
      )}
    </dialog>
  )
}
