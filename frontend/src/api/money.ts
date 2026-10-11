// Money movement on the account axis: bank <-> trading. Not session-gated and it never emits 409.
// A 422 means the balance could not cover it (`{"error": "..."}`); a 504 / dropped connection means
// UNKNOWN — the caller must not blind-retry (see the Transfer dialog).
import { apiPost } from './client'
import type { TransferDirection, TransferResponse } from './types'

/** POST /v1/account/transfer — returns the new balances: `available` (trading) and `bank`. */
export function transferMoney(accountId: string, direction: TransferDirection, amount: number) {
  return apiPost<TransferResponse>('/v1/account/transfer', { account_id: accountId, direction, amount })
}
