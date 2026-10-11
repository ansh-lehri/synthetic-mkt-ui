// Transfer dialog logic (no React): parse the typed amount to raw money units and check it against
// the balance we KNOW. Money is bare int64 in raw units (MONEY_DECIMALS decimals), so "125.50" is
// 12550. Tests in transfer.test.ts.
import type { TransferDirection } from '../api/types'
import { MONEY_DECIMALS, parsePrice } from './ticks'

export const DIRECTIONS: Array<{ value: TransferDirection; label: string; from: string; to: string }> = [
  { value: 'to_trading', label: 'Bank to trading', from: 'bank', to: 'trading' },
  { value: 'to_bank', label: 'Trading to bank', from: 'trading', to: 'bank' },
]

export interface TransferCheck {
  /** Raw units, or null when the text is not a valid positive amount. */
  amount: number | null
  error?: string
}

/** Balances the dialog can see (undefined when none has been read yet — e.g. out of a session). */
export interface KnownBalances {
  trading?: number
  bank?: number
}

export function checkTransfer(text: string, direction: TransferDirection, known: KnownBalances): TransferCheck {
  const t = text.trim()
  if (t === '') return { amount: null }
  const amount = parsePrice(t, { tick_size: 1, price_decimals: MONEY_DECIMALS })
  if (amount === null) return { amount: null, error: `Enter a number with up to ${MONEY_DECIMALS} decimals` }
  if (amount <= 0) return { amount: null, error: 'Amount must be greater than 0' }
  const source = direction === 'to_bank' ? known.trading : known.bank
  if (source !== undefined && amount > source) {
    return { amount: null, error: direction === 'to_bank' ? 'More than your trading balance' : 'More than your bank balance' }
  }
  return { amount }
}
