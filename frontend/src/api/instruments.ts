import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { InstrumentsResponse } from './types'

/** GET /v1/instruments?market= — also carries the tick/price formatting contract. */
export function getInstruments(market: string): Promise<InstrumentsResponse> {
  return apiGet<InstrumentsResponse>('/v1/instruments', { market })
}

export function useInstruments(market: string | undefined) {
  return useQuery({
    queryKey: ['instruments', market],
    queryFn: () => getInstruments(market as string),
    enabled: !!market,
    staleTime: 5 * 60_000, // reference data
  })
}
