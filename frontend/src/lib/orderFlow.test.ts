import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import type { OpenOrder, Observation } from '../api/types'
import { findNewOrder, followOrder, isUnknownOutcome, reasonText, type PlacedOrder } from './orderFlow'

const order = (over: Partial<OpenOrder> = {}): OpenOrder => ({
  order_id: 'a:1', instrument: 'ACME', side: 'buy', is_market: false, limit_price: 10100, orig_qty: 10, remaining_qty: 10,
  filled_qty: 0, reserved_cash: 0, reserved_units: 0, status: 'working', cancel_in_flight: false, ...over,
})
const obs = (orders: OpenOrder[], acmeQty = 10): Observation => ({
  balance: { available: 0, reserved: 0, settled: 0, bank: 0 },
  positions: acmeQty ? [{ instrument: 'ACME', qty: acmeQty, reserved_qty: 0, weighted_avg_entry: 10050, mark_available: false, ltp: 0, gross_unrealized: 0 }] : [],
  orders, recent_trades: [], trades_degraded: false,
})
const placed = (over: Partial<PlacedOrder> = {}): PlacedOrder => ({
  orderId: 'a:1', instrument: 'ACME', side: 'buy', qty: 10, positionAtPlace: 10, seenFilled: 0, ...over,
})

describe('reasonText', () => {
  it('explains no_market_price and falls back for unknown tags', () => {
    expect(reasonText('no_market_price')).toMatch(/Market orders are not available/)
    expect(reasonText('weird_new_tag')).toBe('The order was refused (weird new tag).')
    expect(reasonText(undefined)).toMatch(/refused/)
  })
})

describe('isUnknownOutcome', () => {
  it('treats 504, 5xx and a missing response as "unknown", never as "nothing happened"', () => {
    expect(isUnknownOutcome(new ApiError(504, 'timeout'))).toBe(true)
    expect(isUnknownOutcome(new ApiError(500, 'boom'))).toBe(true)
    expect(isUnknownOutcome(new ApiError(0, 'network'))).toBe(true)
  })
  it('treats definitive answers as known', () => {
    expect(isUnknownOutcome(new ApiError(422, 'x', 'bad_qty'))).toBe(false)
    expect(isUnknownOutcome(new ApiError(409, 'x', 'no_session'))).toBe(false)
    expect(isUnknownOutcome(new Error('x'))).toBe(false)
  })
})

describe('followOrder', () => {
  it('working -> partial -> cancelling while on the book', () => {
    expect(followOrder(placed(), obs([order()]))).toEqual({ state: 'working', filled: 0, qty: 10 })
    expect(followOrder(placed(), obs([order({ filled_qty: 5 })]))).toEqual({ state: 'partial', filled: 5, qty: 10 })
    expect(followOrder(placed(), obs([order({ cancel_in_flight: true })]))).toMatchObject({ state: 'cancelling' })
  })
  it('off the book with the position moved the right way = filled', () => {
    expect(followOrder(placed(), obs([], 20))).toEqual({ state: 'filled', qty: 10 })
    expect(followOrder(placed({ side: 'sell', positionAtPlace: 10 }), obs([], 0))).toEqual({ state: 'filled', qty: 10 })
  })
  it('off the book with no movement = gone (not claimed as filled)', () => {
    expect(followOrder(placed(), obs([], 10))).toEqual({ state: 'gone', qty: 10 })
    // a position moving the WRONG way for the side is not evidence of a fill
    expect(followOrder(placed({ side: 'sell' }), obs([], 20))).toEqual({ state: 'gone', qty: 10 })
  })
})

describe('findNewOrder', () => {
  const sig = { instrument: 'ACME', side: 'buy' as const, qty: 10, limit_price: 10100 }
  it('finds only an order that is new and matches', () => {
    const before = new Set(['a:1'])
    expect(findNewOrder(before, [order({ order_id: 'a:1' })], sig)).toBeNull()
    expect(findNewOrder(before, [order({ order_id: 'a:2', limit_price: 10105 })], sig)).toBeNull()
    expect(findNewOrder(before, [order({ order_id: 'a:2', side: 'sell' })], sig)).toBeNull()
    expect(findNewOrder(before, [order({ order_id: 'a:2' })], sig)?.order_id).toBe('a:2')
  })
})
