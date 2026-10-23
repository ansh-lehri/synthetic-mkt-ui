// contract/openapi.yaml's Instrument schema: name/lot_size/price_decimals are optional,
// client-defaulted fields — a confirmed real-backend gap (BACKEND-INTEGRATION-PLAN.md §4).
// This is the one place those defaults live; swap/remove them once the backend ships the
// real fields, not the call sites that use these helpers.
import type { Instrument } from '../api/types'
import type { PriceFormat } from './ticks'
import type { TicketInstrument } from './orderTicket'

const DEFAULT_LOT_SIZE = 1
const DEFAULT_PRICE_DECIMALS = 2

export function instrumentName(i: Instrument): string {
  return i.name ?? i.id
}

export function instrumentLotSize(i: Instrument): number {
  return i.lot_size ?? DEFAULT_LOT_SIZE
}

export function priceFormatOf(i: Instrument): PriceFormat {
  return { tick_size: i.tick_size, price_decimals: i.price_decimals ?? DEFAULT_PRICE_DECIMALS }
}

export function ticketInstrumentOf(i: Instrument): TicketInstrument {
  return { symbol: i.id, ...priceFormatOf(i), lot_size: instrumentLotSize(i) }
}
