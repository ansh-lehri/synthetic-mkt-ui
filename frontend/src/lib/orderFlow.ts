// Pure order-flow logic for the Terminal (no React): how a POST failure is read, how an
// order the user placed is followed through the observation poll, and how a 504 is reconciled.
// Tests live in orderFlow.test.ts.
import { ApiError } from '../api/client'
import type { OpenOrder, Observation, Position } from '../api/types'
import type { Side } from './orderTicket'

// ---------------------------------------------------------------- POST failures

/** The business-reject tags the contract lists for POST /v1/orders (422) and cancel (409). */
const REASONS: Record<string, string> = {
  unknown_instrument: 'That instrument is not tradable.',
  bad_side: 'The side must be buy or sell.',
  bad_qty: 'The quantity is not valid for this instrument.',
  bad_price: 'The limit price is not valid for this instrument.',
  bad_type: 'That order type is not supported.',
  insufficient_funds: 'Not enough funds (or units to sell) for this order.',
  no_market_price: 'Market orders are not available yet. Use a limit order.',
  no_session: 'You are not in a live session.',
  unknown_order: 'That order is no longer on the book.',
  not_cancellable: 'That order is already being cancelled.',
}

export function reasonText(reason: string | undefined): string {
  if (!reason) return 'The order was refused.'
  return REASONS[reason] ?? `The order was refused (${reason.replace(/_/g, ' ')}).`
}

/**
 * Did the POST get an answer at all? A 504, a 5xx, or no response (status 0) mean we do NOT
 * know whether the exchange acted. Never treat these as "nothing happened".
 */
export function isUnknownOutcome(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.status >= 500)
}

// ---------------------------------------------------------------- following one order

export interface PlacedOrder {
  orderId: string
  instrument: string
  side: Side
  qty: number
  /** The position (signed qty) in this instrument when the order was placed. */
  positionAtPlace: number
  /** Filled qty already known when we started following (an order found by reconciling). */
  seenFilled: number
}

export type OrderProgress =
  | { state: 'working'; filled: number; qty: number }
  | { state: 'partial'; filled: number; qty: number }
  | { state: 'cancelling'; filled: number; qty: number }
  | { state: 'filled'; qty: number }
  | { state: 'gone'; qty: number }

export const positionQty = (positions: readonly Position[], instrument: string): number =>
  positions.find((p) => p.instrument === instrument)?.qty ?? 0

/**
 * Where is an order we placed, according to the latest observation?
 *  - on the book -> working / partial / cancelling;
 *  - off the book -> `filled` when the position moved the way the order would move it,
 *    otherwise `gone`: it left the book without us seeing a fill (cancelled, or refused
 *    by the exchange) — we say so rather than guess.
 */
export function followOrder(placed: PlacedOrder, obs: Observation): OrderProgress {
  const o = obs.orders.find((x) => x.order_id === placed.orderId)
  if (o) {
    if (o.cancel_in_flight) return { state: 'cancelling', filled: o.filled_qty, qty: o.orig_qty }
    return { state: o.filled_qty > 0 ? 'partial' : 'working', filled: o.filled_qty, qty: o.orig_qty }
  }
  const moved = positionQty(obs.positions, placed.instrument) - placed.positionAtPlace
  const wanted = placed.side === 'buy' ? moved > 0 : moved < 0
  if (wanted || placed.seenFilled >= placed.qty) return { state: 'filled', qty: placed.qty }
  return { state: 'gone', qty: placed.qty }
}

// ---------------------------------------------------------------- reconciling a 504

export interface OrderSignature {
  instrument: string
  side: Side
  qty: number
  limit_price?: number
}

/**
 * After a 504 on POST /v1/orders: is there an order on the book that was not there before and
 * matches what we sent? Returns it, or null. (A fill that already completed leaves no order;
 * the caller says "not found yet" and leaves the decision to the user — it never resubmits.)
 */
export function findNewOrder(before: ReadonlySet<string>, now: readonly OpenOrder[], sig: OrderSignature): OpenOrder | null {
  return (
    now.find(
      (o) =>
        !before.has(o.order_id) &&
        o.instrument === sig.instrument &&
        o.side === sig.side &&
        o.orig_qty === sig.qty &&
        (sig.limit_price === undefined || o.limit_price === sig.limit_price),
    ) ?? null
  )
}
