import { useEffect, useMemo } from 'react'
import type { Sub } from '@contract/ws'
import { useInstruments, useMarkets, type Instrument, type Market } from '../../api'
import { retainSubscriptions, useMarketStore } from '../../lib/marketStore'
import type { PriceFormat } from '../../lib/ticks'

/** The market the Terminal is bound to (the socket is bound to one market by the backend). */
export function useTerminalMarket(): { market: Market | undefined; isPending: boolean; error: unknown; refetch: () => void } {
  const q = useMarkets({ refetchMs: 15_000 })
  return { market: q.data?.markets[0], isPending: q.isPending, error: q.error, refetch: () => void q.refetch() }
}

export interface InstrumentBook {
  instruments: Instrument[]
  fmtFor: (symbol: string) => PriceFormat | null
  isPending: boolean
  error: unknown
  refetch: () => void
}

/** GET /v1/instruments plus the tick formatting contract per symbol (stable identities). */
export function useInstrumentBook(marketCode: string | undefined): InstrumentBook {
  const q = useInstruments(marketCode)
  const instruments = useMemo(() => q.data?.instruments ?? [], [q.data])
  const fmts = useMemo(() => {
    const m = new Map<string, PriceFormat>()
    for (const i of instruments) m.set(i.instrument, { tick_size: i.tick_size, price_decimals: i.price_decimals })
    return m
  }, [instruments])
  return { instruments, fmtFor: (s) => fmts.get(s) ?? null, isPending: q.isPending, error: q.error, refetch: () => void q.refetch() }
}

/** Hold socket subscriptions for as long as the component is mounted. */
export function useSubscriptions(subs: Sub[]): void {
  const key = JSON.stringify(subs)
  useEffect(() => retainSubscriptions(JSON.parse(key) as Sub[]), [key])
}

export function useSnapshot(symbol: string | undefined) {
  return useMarketStore((s) => (symbol ? s.snapshots[symbol] : undefined))
}
