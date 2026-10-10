// Durable account reads (account axis, HTTP pull): trades, P&L, costs. These are 200 even
// when empty and never need a live session. All amounts are bare int64 — format them with
// lib/ticks.ts. List endpoints are keyset-paginated newest-first: pass the previous
// response's `next_before` as `before`; `null` means the last page.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { Country, CostsPage, CostsSummary, PnlSummary, TradesPage } from './types'

/** Page size for the Record lists (contract default is 50). */
export const PAGE_SIZE = 20

export function getTrades(accountId: string, before: string | undefined, limit = PAGE_SIZE) {
  return apiGet<TradesPage>('/v1/account/trades', { account_id: accountId, limit, before })
}

export function getPnl(accountId: string) {
  return apiGet<PnlSummary>('/v1/account/pnl', { account_id: accountId })
}

export function getCosts(accountId: string, country: Country, before: string | undefined, limit = PAGE_SIZE) {
  return apiGet<CostsPage>('/v1/account/costs', { account_id: accountId, country, limit, before })
}

export function getCostsSummary(accountId: string, country: Country) {
  return apiGet<CostsSummary>('/v1/account/costs/summary', { account_id: accountId, country })
}

/** Closed trades, newest first. `before` (RFC3339) is the starting cursor for a date range. */
export function useTrades(accountId: string, before: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['trades', accountId, before ?? null],
    queryFn: ({ pageParam }) => getTrades(accountId, pageParam),
    initialPageParam: before,
    getNextPageParam: (last) => last.next_before ?? undefined,
  })
}

export function usePnl(accountId: string) {
  return useQuery({ queryKey: ['pnl', accountId], queryFn: () => getPnl(accountId) })
}

/** Per-trade cost lines. `enabled` lets the Tax tab fetch lazily; a 501 (US) is not retried. */
export function useCosts(accountId: string, country: Country, before: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['costs', accountId, country, before ?? null],
    queryFn: ({ pageParam }) => getCosts(accountId, country, pageParam),
    initialPageParam: before,
    getNextPageParam: (last) => last.next_before ?? undefined,
    enabled,
    retry: noRetryOn501,
  })
}

export function useCostsSummary(accountId: string, country: Country, enabled: boolean) {
  return useQuery({
    queryKey: ['costs-summary', accountId, country],
    queryFn: () => getCostsSummary(accountId, country),
    enabled,
    retry: noRetryOn501,
  })
}

// 501 is a definitive "not implemented for this country" — retrying can't change it.
function noRetryOn501(failures: number, error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status
  return status !== 501 && failures < 1
}
