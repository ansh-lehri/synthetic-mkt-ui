import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { MarketsResponse } from './types'

/** GET /v1/markets — session/reference axis (provisional). */
export function getMarkets(): Promise<MarketsResponse> {
  return apiGet<MarketsResponse>('/v1/markets')
}

export function useMarkets() {
  return useQuery({ queryKey: ['markets'], queryFn: getMarkets })
}
