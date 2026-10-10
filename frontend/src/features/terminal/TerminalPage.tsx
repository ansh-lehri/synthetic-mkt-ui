import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { CandleTimeframe } from '../../api'
import { Banner, Card, SkeletonText, TopBar } from '../../components'
import { getAccountId } from '../../lib/account'
import { useMarketStore } from '../../lib/marketStore'
import { TIMEFRAMES } from './bars'
import { ChartTab } from './ChartTab'
import { useInstrumentBook, useSubscriptions, useTerminalMarket } from './hooks'
import { MarketTab } from './MarketTab'

type Tab = 'market' | 'chart'

// Tabs that belong to later slices (Orders, Positions, Trades, P&L) join this list in 3b.
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'market', label: 'Market' },
  { id: 'chart', label: 'Chart' },
]

const PHASE_LABEL: Record<string, string> = { preopen: 'Pre-open', open: 'Open', closing: 'Closing', closed: 'Closed' }
const PHASE_GLYPH: Record<string, string> = { preopen: '○', open: '●', closing: '◆', closed: '■' }

/** Initial tab / instrument / timeframe may be set from the URL (?tab=chart&sym=BETA&tf=5m). */
function initialFromUrl(): { tab: Tab; sym: string | null; tf: CandleTimeframe } {
  const q = new URLSearchParams(window.location.search)
  const tab = q.get('tab') === 'chart' ? 'chart' : 'market'
  const tf = q.get('tf') as CandleTimeframe | null
  return { tab, sym: q.get('sym'), tf: tf && TIMEFRAMES.includes(tf) ? tf : '5m' }
}

/**
 * The Terminal, market-data half: instrument list with live prices and depth, and the price
 * chart. Market data arrives over the WebSocket (Zustand); nothing here polls account state.
 * (Session bar states come in 3c; the order ticket and the positions/orders/P&L tabs in 3b.)
 */
export default function TerminalPage() {
  const init = useMemo(() => initialFromUrl(), [])
  const [tab, setTab] = useState<Tab>(init.tab)
  const [symbol, setSymbol] = useState<string | null>(init.sym)
  const [timeframe, setTimeframe] = useState<CandleTimeframe>(init.tf)
  const queryClient = useQueryClient()

  const m = useTerminalMarket()
  const book = useInstrumentBook(m.market?.code)
  const status = useMarketStore((s) => s.status)
  const snapshots = useMarketStore((s) => s.snapshots)

  // Keep a live price for every instrument in the list (the watchlist), on one socket.
  useSubscriptions(book.instruments.map((i) => ({ stream: 'snapshot' as const, instrument: i.instrument })))

  const activeSymbol = symbol && book.instruments.some((i) => i.instrument === symbol) ? symbol : book.instruments[0]?.instrument

  // The session phase comes from the snapshots (the socket is the live source), falling back
  // to the markets list before the first snapshot.
  const phase = (activeSymbol && snapshots[activeSymbol]?.phase) || m.market?.live_session.phase
  useEffect(() => {
    // A phase change moves "today's" session window: refresh it so the live bar's bucket is right.
    if (phase) void queryClient.invalidateQueries({ queryKey: ['markets'] })
  }, [phase, queryClient])

  return (
    <div className="min-h-screen bg-bg text-ink">
      <TopBar
        markets={m.market ? [{ code: m.market.code, name: m.market.name }] : []}
        market={m.market?.code ?? ''}
        onMarketChange={() => {}}
        marketsLoading={m.isPending}
        accountLabel={getAccountId()}
        accountItems={[
          { label: 'Terminal', onSelect: () => {} },
          { label: 'Record', onSelect: () => window.location.assign('/record') },
        ]}
      />

      <div className="border-b border-line bg-bg">
        <div className="flex w-full flex-wrap items-center gap-x-4 px-4 sm:px-6 lg:px-8">
          <nav aria-label="Trading" className="flex min-w-0 gap-0.5 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => setTab(t.id)}
                className={`relative min-h-[56px] whitespace-nowrap px-4 ${tab === t.id ? 'font-semibold text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-sm after:bg-accent' : 'font-medium text-muted hover:text-ink'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex-1" />
          {phase && (
            <span className="inline-flex items-center gap-1.5 text-sm" data-testid="phase">
              <span aria-hidden="true" className={phase === 'open' ? 'text-gain' : 'text-muted'}>{PHASE_GLYPH[phase] ?? '•'}</span>
              <span className="sr-only">Market phase: </span>
              <span className="font-semibold">{PHASE_LABEL[phase] ?? phase}</span>
            </span>
          )}
          <span className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted" data-testid="conn">
            <span aria-hidden="true" className={status === 'live' ? 'text-gain' : 'text-loss'}>●</span>
            {status === 'live' ? 'Live' : status === 'idle' ? 'Offline' : 'Connecting…'}
          </span>
        </div>
      </div>

      <main className="flex w-full flex-col gap-4 px-4 pb-10 pt-5 sm:px-6 lg:px-8">
        {(status === 'reconnecting' || (status === 'connecting' && Object.keys(snapshots).length > 0)) && (
          <Banner tone="warn" title="Reconnecting to live prices">
            Prices and the chart will refresh as soon as the connection is back.
          </Banner>
        )}

        {m.error ? (
          <Banner tone="error" title="Could not load the market">
            {m.error instanceof Error ? m.error.message : 'Something went wrong.'}
          </Banner>
        ) : !m.market || !activeSymbol ? (
          <Card><SkeletonText lines={4} label="Loading" /></Card>
        ) : tab === 'market' ? (
          <MarketTab
            book={book}
            onOpenChart={(s) => {
              setSymbol(s)
              setTab('chart')
            }}
          />
        ) : (
          <ChartTab
            market={m.market}
            instruments={book.instruments}
            fmtFor={book.fmtFor}
            symbol={activeSymbol}
            onSymbol={setSymbol}
            timeframe={timeframe}
            onTimeframe={setTimeframe}
          />
        )}
      </main>
    </div>
  )
}
