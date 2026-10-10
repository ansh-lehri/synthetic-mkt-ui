// Candle history (market-data axis, HTTP pull). Naive-local times in the market's tz; only
// FINALIZED bars; 200 incl. empty. Live bars arrive over the WebSocket (Model A).
import { apiGet } from './client'
import type { CandleResponse } from './types'

export type CandleTimeframe = CandleResponse['timeframe']

export interface CandleQuery {
  market: string
  instrument: string
  timeframe: CandleTimeframe
  /** Naive-local ISO in the market's tz. */
  from: string
  to: string
}

const PAGE = 500 // the largest page the contract allows

export function getCandlesPage(q: CandleQuery, cursor?: string): Promise<CandleResponse> {
  return apiGet<CandleResponse>('/v1/candles', { ...q, limit: PAGE, cursor })
}

/** Walk next_cursor until it is null and return every bar, oldest first. */
export async function getAllCandles(q: CandleQuery): Promise<CandleResponse['candles']> {
  const out: CandleResponse['candles'] = []
  let cursor: string | undefined
  for (let pages = 0; pages < 100; pages++) {
    const page = await getCandlesPage(q, cursor)
    out.push(...page.candles)
    if (!page.next_cursor) return out
    cursor = page.next_cursor
  }
  throw new Error('candle paging did not terminate')
}
