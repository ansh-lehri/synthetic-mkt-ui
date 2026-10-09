// Pure order-ticket maths + validation (no React). The OrderTicket component renders
// whatever this returns; tests live in orderTicket.test.ts.
import { formatPrice, isTickAligned, parsePrice, type PriceFormat } from './ticks'

export type Side = 'buy' | 'sell'
export type OrderType = 'limit' | 'market'

export interface TicketInstrument extends PriceFormat {
  /** Instrument symbol, e.g. "ACME". */
  symbol: string
  /** Quantity step; qty must be a positive multiple of this. */
  lot_size: number
}

export interface TicketErrors {
  qty?: string
  price?: string
}

export interface TicketCheck {
  qty: number | null
  /** Raw limit price; null for market orders or when invalid. */
  price: number | null
  errors: TicketErrors
  ok: boolean
}

/** Validate the text the user typed. Never rounds or guesses — it reports what is wrong. */
export function checkTicket(input: {
  qtyText: string
  priceText: string
  type: OrderType
  instrument: TicketInstrument
}): TicketCheck {
  const { qtyText, priceText, type, instrument } = input
  const errors: TicketErrors = {}

  let qty: number | null = null
  const q = qtyText.trim()
  if (q === '') errors.qty = 'Enter a quantity'
  else if (!/^\d+$/.test(q)) errors.qty = 'Whole numbers only'
  else {
    const n = Number(q)
    if (!Number.isSafeInteger(n) || n <= 0) errors.qty = 'Quantity must be greater than 0'
    else if (n % instrument.lot_size !== 0) errors.qty = `Must be a multiple of ${instrument.lot_size}`
    else qty = n
  }

  let price: number | null = null
  if (type === 'limit') {
    const p = priceText.trim()
    if (p === '') errors.price = 'Enter a limit price'
    else {
      const parsed = parsePrice(p, instrument)
      if (parsed === null) errors.price = `Up to ${instrument.price_decimals} decimals, numbers only`
      else if (parsed <= 0) errors.price = 'Price must be greater than 0'
      else if (!isTickAligned(parsed, instrument.tick_size)) {
        errors.price = `Must be a multiple of ${formatPrice(instrument.tick_size, instrument)}`
      } else price = parsed
    }
  }

  return { qty, price, errors, ok: Object.keys(errors).length === 0 }
}

/**
 * Estimated cost = qty × limit price, in the same raw units as money (see ticks.ts).
 * Null when it can't be estimated (market order, or invalid input).
 */
export function estimateCost(qty: number | null, price: number | null): bigint | null {
  if (qty === null || price === null) return null
  return BigInt(qty) * BigInt(price)
}
