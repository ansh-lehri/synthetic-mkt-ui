import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { MarketsResponse } from './types'

/** GET /v1/markets — session/reference axis (provisional). */
export function getMarkets(): Promise<MarketsResponse> {
  return apiGet<MarketsResponse>('/v1/markets')
}

/** `refetchMs` keeps the live-session window and phase fresh (the Terminal polls it). */
export function useMarkets(opts?: { refetchMs?: number }) {
  return useQuery({ queryKey: ['markets'], queryFn: getMarkets, refetchInterval: opts?.refetchMs })
}
