// Backend capability flags. Each is a fact about the REAL backend today (CLAUDE.md "Settled
// facts"), kept in one place so the UI lights a feature up by flipping one value.
import type { Capability } from '../components/Button'

export const capabilities = {
  /** Market orders reject with `no_market_price` on the real backend until Phase 7. */
  marketOrders: false,
  /** Positions carry a live mark (`mark_available`) — LTP and unrealised P&L. Phase 7. */
  positionMarks: false,
} as const

export const marketOrdersCapability: Capability = {
  enabled: capabilities.marketOrders,
  reason: 'Market orders are not available yet — the exchange has no live price to fill them against. Use a limit order.',
}
