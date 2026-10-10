import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { ApiError, useObservation, type CandleTimeframe, type OpenOrder } from '../../api'
import { Banner, Button, Card, SkeletonText, TopBar } from '../../components'
import { getAccountId } from '../../lib/account'
import { useMarketStore } from '../../lib/marketStore'
import type { Side } from '../../lib/orderTicket'
import { AccountStrip } from './AccountStrip'
import { OrdersTab, PnlTab, PositionsTab, TradesTab } from './AccountTabs'
import { TIMEFRAMES } from './bars'
import { ChartTab } from './ChartTab'
import { useInstrumentBook, useSubscriptions, useTerminalMarket } from './hooks'
import { MarketTab } from './MarketTab'
import { ModifyDialog } from './ModifyDialog'
import { OrderDrawer, type OrderDrawerState } from './OrderDrawer'
import { useOrderActions } from './useOrderActions'
import { useOrderEntry } from './useOrderEntry'

type Tab = 'market' | 'chart' | 'orders' | 'positions' | 'trades' | 'pnl'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'market', label: 'Market' },
  { id: 'chart', label: 'Chart' },
  { id: 'orders', label: 'Orders' },
  { id: 'positions', label: 'Positions' },
  { id: 'trades', label: 'Trades' },
  { id: 'pnl', label: 'P&L' },
]
const TAB_IDS = TABS.map((t) => t.id)

const PHASE_LABEL: Record<string, string> = { preopen: 'Pre-open', open: 'Open', closing: 'Closing', closed: 'Closed' }
const PHASE_GLYPH: Record<string, string> = { preopen: '○', open: '●', closing: '◆', closed: '■' }

/** Initial tab / instrument / timeframe may be set from the URL (?tab=chart&sym=BETA&tf=5m). */
function initialFromUrl(): { tab: Tab; sym: string | null; tf: CandleTimeframe } {
  const q = new URLSearchParams(window.location.search)
  const t = q.get('tab') as Tab | null
  const tab: Tab = t && TAB_IDS.includes(t) ? t : 'market'
  const tf = q.get('tf') as CandleTimeframe | null
  return { tab, sym: q.get('sym'), tf: tf && TIMEFRAMES.includes(tf) ? tf : '5m' }
}

/**
 * The Terminal, on two transports at once. Market data (instrument list, depth, chart) arrives
 * over the WebSocket into Zustand. Account state (balance, positions, orders, recent trades) is
 * ONE HTTP poll of `GET /v1/account/observation` via TanStack Query — there is no order stream,
 * so a fill is only ever seen by polling. (Session bar states come in 3c.)
 */
export default function TerminalPage() {
  const init = useMemo(() => initialFromUrl(), [])
  const [tab, setTab] = useState<Tab>(init.tab)
  const [symbol, setSymbol] = useState<string | null>(init.sym)
  const [timeframe, setTimeframe] = useState<CandleTimeframe>(init.tf)
  const queryClient = useQueryClient()
  const accountId = getAccountId()

  const m = useTerminalMarket()
  const book = useInstrumentBook(m.market?.code)
  const status = useMarketStore((s) => s.status)
  const snapshots = useMarketStore((s) => s.snapshots)

  // Keep a live price for every instrument in the list (the watchlist), on one socket.
  useSubscriptions(book.instruments.map((i) => ({ stream: 'snapshot' as const, instrument: i.instrument })))

  // ---- account half (HTTP poll)
  const obsQ = useObservation(accountId)
  const obs = obsQ.data
  const noSession = obsQ.error instanceof ApiError && obsQ.error.status === 409
  const obsFailed = !!obsQ.error && !noSession
  const entry = useOrderEntry(accountId, obs, obsQ.dataUpdatedAt)
  const actions = useOrderActions(accountId)
  const [drawer, setDrawer] = useState<OrderDrawerState | null>(null)
  const [modifying, setModifying] = useState<OpenOrder | null>(null)
  const openDrawer = (side: Side, sym: string) => {
    entry.reset()
    setDrawer((d) => ({ side, symbol: sym, n: (d?.n ?? 0) + 1 }))
  }

  const activeSymbol = symbol && book.instruments.some((i) => i.instrument === symbol) ? symbol : book.instruments[0]?.instrument

  // The session phase comes from the snapshots (the socket is the live source), falling back
  // to the markets list before the first snapshot.
  const phase = (activeSymbol && snapshots[activeSymbol]?.phase) || m.market?.live_session.phase
  useEffect(() => {
    // A phase change moves "today's" session window: refresh it so the live bar's bucket is right.
    if (phase) void queryClient.invalidateQueries({ queryKey: ['markets'] })
  }, [phase, queryClient])

  const instrumentOf = (sym: string) => book.instruments.find((i) => i.instrument === sym)
  const badge = (id: Tab): number | undefined =>
    id === 'orders' ? obs?.orders.length : id === 'positions' ? obs?.positions.filter((p) => p.qty !== 0).length : undefined

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
                {!!badge(t.id) && (
                  <span className="ml-2 rounded-pill border border-line px-2 text-xs text-muted tnum" data-testid={`badge-${t.id}`}>{badge(t.id)}</span>
                )}
                {t.id === 'trades' && obs?.trades_degraded && (
                  <>
                    <span aria-hidden="true" className="ml-1.5 text-ink">!</span>
                    <span className="sr-only">(recent trades unavailable)</span>
                  </>
                )}
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
        ) : (
          <>
            <AccountStrip obs={obs} disabled={noSession} onTrade={(side) => openDrawer(side, tab === 'chart' ? activeSymbol : drawer?.symbol ?? activeSymbol)} />

            {noSession && (
              <Banner tone="warn" title="You are not in a live session">
                Balance, positions and orders appear once you join a session, and orders are off until then.
              </Banner>
            )}
            {obsFailed && (
              <Banner
                tone="error"
                title="Could not refresh your account"
                action={<Button variant="ghost" onClick={() => void obsQ.refetch()}>Retry</Button>}
              >
                {obsQ.error instanceof Error ? obsQ.error.message : 'Something went wrong.'}
                {obs ? ' Showing the last numbers we had.' : ''}
              </Banner>
            )}

            {tab === 'market' ? (
              <MarketTab
                book={book}
                holdings={obs?.positions}
                onTrade={noSession ? undefined : openDrawer}
                onOpenChart={(s) => {
                  setSymbol(s)
                  setTab('chart')
                }}
              />
            ) : tab === 'chart' ? (
              <ChartTab
                market={m.market}
                instruments={book.instruments}
                fmtFor={book.fmtFor}
                symbol={activeSymbol}
                onSymbol={setSymbol}
                timeframe={timeframe}
                onTimeframe={setTimeframe}
              />
            ) : !obs ? (
              obsQ.isPending ? <Card><SkeletonText lines={3} label="Loading your account" /></Card> : null
            ) : tab === 'orders' ? (
              <OrdersTab
                orders={obs.orders}
                fmtFor={book.fmtFor}
                busy={actions.busy}
                notice={actions.notice}
                onDismissNotice={actions.dismiss}
                onModify={setModifying}
                onCancel={(id) => void actions.cancel(id)}
                onCancelAll={() => void actions.cancelAll(obs.orders)}
              />
            ) : tab === 'positions' ? (
              <PositionsTab positions={obs.positions} names={(s) => instrumentOf(s)?.name ?? ''} fmtFor={book.fmtFor} />
            ) : tab === 'trades' ? (
              <TradesTab trades={obs.recent_trades} degraded={obs.trades_degraded} fmtFor={book.fmtFor} tz={m.market.timezone} />
            ) : (
              <PnlTab balance={obs.balance} trades={obs.recent_trades} degraded={obs.trades_degraded} />
            )}
          </>
        )}
      </main>

      <OrderDrawer
        state={drawer}
        instruments={book.instruments}
        obs={obs}
        noSession={noSession}
        entry={entry}
        onSymbol={(sym) => {
          entry.reset()
          setDrawer((d) => (d ? { ...d, symbol: sym } : d))
        }}
        onClose={() => setDrawer(null)}
      />
      <ModifyDialog
        order={modifying}
        instrument={modifying ? instrumentOf(modifying.instrument) : undefined}
        onCancel={() => setModifying(null)}
        onSubmit={(req) => {
          setModifying(null)
          void actions.modify(req)
        }}
      />
    </div>
  )
}
