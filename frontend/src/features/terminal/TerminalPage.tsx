import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useObservation, type CandleTimeframe, type OpenOrder } from '../../api'
import { Banner, Button, Card, ConfirmDialog, Num, SessionBar, SkeletonText, TopBar } from '../../components'
import { logout, requireAccountId, requireEmail } from '../../lib/identity'
import { instantToNaiveLocal, useMarketClock } from '../../lib/marketClock'
import { marketName, marketTimezone } from '../../lib/marketTimezone'
import { setMarketSession, useMarketStore } from '../../lib/marketStore'
import type { Side } from '../../lib/orderTicket'
import { clockPhase, fromWirePhase } from '../../lib/liveCard'
import { clockOf, closeLabel, exitCopy, orderBlockReason, switchCopy, timeLeft } from '../../lib/session'
import { AccountStrip } from './AccountStrip'
import { OrdersTab, PnlTab, PositionsTab, TradesTab } from './AccountTabs'
import { TIMEFRAMES } from './bars'
import { ChartTab } from './ChartTab'
import { EnterSession } from './EnterSession'
import { useInstrumentBook, useSubscriptions, useTerminalMarket } from './hooks'
import { MarketTab } from './MarketTab'
import { ModifyDialog } from './ModifyDialog'
import { OrderDrawer, type OrderDrawerState } from './OrderDrawer'
import { useOrderActions } from './useOrderActions'
import { useOrderEntry } from './useOrderEntry'
import { useSessionFlow } from '../session/useSessionFlow'

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
 * so a fill is only ever seen by polling. The session (live / practice / none) comes from
 * `GET /v1/session`; without one, account reads answer 409 and the enter-session panel shows.
 */
export default function TerminalPage() {
  const init = useMemo(() => initialFromUrl(), [])
  const [tab, setTab] = useState<Tab>(init.tab)
  const [symbol, setSymbol] = useState<string | null>(init.sym)
  const [timeframe, setTimeframe] = useState<CandleTimeframe>(init.tf)
  const queryClient = useQueryClient()
  const accountId = requireAccountId()
  const email = requireEmail()

  const m = useTerminalMarket()
  const tz = m.market ? marketTimezone(m.market.tag) : undefined
  const book = useInstrumentBook(m.market?.tag)
  const status = useMarketStore((s) => s.status)
  const snapshots = useMarketStore((s) => s.snapshots)

  // Keep a live price for every instrument in the list (the watchlist), on one socket.
  useSubscriptions(book.instruments.map((i) => ({ stream: 'snapshot' as const, instrument: i.id })))

  // ---- session (HTTP poll): which session the account is in, and the way in / out
  const session = useSessionFlow(email ?? '', m.market?.tag)
  const sess = session.active
  const noSession = session.known && !sess

  // The real backend's /v1/ws requires a session — there is no anonymous market-data feed.
  // The socket connects/reconnects/disconnects as the session changes (join/exit/switch).
  useEffect(() => {
    setMarketSession(sess?.sessionId ?? null)
  }, [sess?.sessionId])

  // ---- account half (HTTP poll) — only meaningful inside a session (otherwise it answers 409)
  const obsQ = useObservation(accountId ?? '', !!sess && !!accountId)
  const obs = sess ? obsQ.data : undefined
  const obsFailed = !!sess && !!obsQ.error
  const entry = useOrderEntry(accountId ?? '', obs, obsQ.dataUpdatedAt)
  const actions = useOrderActions(accountId ?? '')
  const [drawer, setDrawer] = useState<OrderDrawerState | null>(null)
  const [modifying, setModifying] = useState<OpenOrder | null>(null)
  const openDrawer = (side: Side, sym: string) => {
    entry.reset()
    setDrawer((d) => ({ side, symbol: sym, n: (d?.n ?? 0) + 1 }))
  }

  const activeSymbol = symbol && book.instruments.some((i) => i.id === symbol) ? symbol : book.instruments[0]?.id

  // Market state. The UI decides it from its own market clock and the session's close time;
  // the WS snapshot phase (the ONLY place phase is carried at all — no session endpoint has
  // one, confirmed real-backend shape) is only the fallback until the clock is known.
  const wirePhase = activeSymbol && snapshots[activeSymbol]?.phase
  const backendPhase = wirePhase ? fromWirePhase(wirePhase) : undefined
  const nowLocal = useMarketClock(tz) // the UI runs the clock itself
  // Live (canonical) has no end-timer from the session itself — fall back to the market's own
  // schedule; practice (on-demand) carries session_ends_at (a real instant) directly.
  const closesAtNaive =
    sess?.mode === 'practice' && sess.closesAt && tz
      ? instantToNaiveLocal(sess.closesAt, tz)
      : m.market && tz
        ? instantToNaiveLocal(m.market.session.closes_at, tz)
        : undefined
  const opensAtNaive = sess?.mode === 'live' && m.market && tz ? instantToNaiveLocal(m.market.session.opens_at, tz) : undefined
  const phase = backendPhase
    ? clockPhase(nowLocal, opensAtNaive, closesAtNaive, backendPhase)
    : undefined
  useEffect(() => {
    // A phase change moves "today's" session window: refresh it so the live bar's bucket is right.
    if (backendPhase) void queryClient.invalidateQueries({ queryKey: ['markets'] })
  }, [backendPhase, queryClient])

  const mode = sess?.mode
  const orderBlock = mode ? orderBlockReason(phase, mode) : undefined
  const closes = closeLabel(closesAtNaive)
  // Past the close on the local clock but the backend still says trading: the two disagree, so
  // show the close time rather than a misleading 0:00:00.
  const rawLeft = timeLeft(nowLocal, closesAtNaive)
  const left = phase === 'closed' ? '0:00:00' : rawLeft === '0:00:00' ? undefined : rawLeft
  const realised = obs && !obs.trades_degraded ? obs.recent_trades.reduce((sum, t) => sum + t.net_pnl, 0) : 0

  const instrumentOf = (sym: string) => book.instruments.find((i) => i.id === sym)
  const badge = (id: Tab): number | undefined =>
    id === 'orders' ? obs?.orders.length : id === 'positions' ? obs?.positions.filter((p) => p.qty !== 0).length : undefined

  if (!accountId || !email) return null // requireAccountId/requireEmail already redirected to /signup

  return (
    <div className="min-h-screen bg-bg text-ink">
      <TopBar
        markets={m.market ? [{ code: m.market.tag, name: marketName(m.market.tag) }] : []}
        market={m.market?.tag ?? ''}
        onMarketChange={() => {}}
        marketsLoading={m.isPending}
        accountLabel={accountId}
        accountItems={[
          { label: 'Home', onSelect: () => window.location.assign('/') },
          { label: 'Terminal', onSelect: () => {} },
          { label: 'Record', onSelect: () => window.location.assign('/record') },
          { label: 'Log out', onSelect: logout },
        ]}
      />

      {sess && (
        <SessionBar
          mode={sess.mode}
          market={m.market ? marketName(m.market.tag) : sess.market}
          phase={phase ?? 'preopen'}
          clock={clockOf(nowLocal)}
          remainingLabel={left ? 'Time left' : 'Closes'}
          remaining={left ?? closes}
          timezone={tz ?? ''}
          // No condition shown here: it's frontend-only state tied to the setup screen, not
          // retained server-side across a page load (BACKEND-INTEGRATION-PLAN.md §4).
          stats={[
            { label: 'P&L · latest trades', value: <Num kind="signed-money" value={realised} available={!!obs && !obs.trades_degraded} /> },
            { label: 'Open positions', value: <Num kind="qty" value={obs?.positions.filter((p) => p.qty !== 0).length ?? 0} available={!!obs} /> },
          ]}
          actions={
            <Button
              variant="ghost"
              disabled={!!session.busy}
              onClick={() => (sess.mode === 'live' ? window.location.assign('/practice') : void session.enter({ kind: 'live' }))}
            >
              {sess.mode === 'live' ? 'Start practice' : 'Join live'}
            </Button>
          }
          confirm={exitCopy(sess.mode, closes)}
          exiting={session.busy === 'exit'}
          onExit={() => {
            setDrawer(null) // leaving the session closes the order window
            void session.exit()
          }}
        />
      )}

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
          <span className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted" data-testid="conn">
            <span aria-hidden="true" className={status === 'live' ? 'text-gain' : 'text-loss'}>●</span>
            {status === 'live' ? 'Prices live' : status === 'idle' ? 'Offline' : 'Connecting…'}
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
            {session.loadError ? (
              <Banner
                tone="error"
                title="Could not check your session"
                action={<Button variant="ghost" onClick={session.refetch}>Retry</Button>}
              >
                {session.loadError instanceof Error ? session.loadError.message : 'Something went wrong.'}
              </Banner>
            ) : noSession ? (
              <EnterSession
                marketName={m.market ? marketName(m.market.tag) : undefined}
                busy={session.busy === 'enter'}
                notice={session.notice}
                onDismiss={session.dismiss}
                onEnter={(t) => void session.enter(t)}
              />
            ) : (
              <>
                {session.notice && <Banner tone={session.notice.tone} title={session.notice.title} onDismiss={session.dismiss}>{session.notice.body}</Banner>}
                {phase === 'closed' && (
                  <Banner tone="info" title="Market closed.">
                    {mode === 'live'
                      ? 'This session is read-only: orders are off. Your result is in your Record.'
                      : 'This practice session has ended: orders are off. Nothing from it was recorded.'}
                    {mode === 'live' && <> <a href="/record" className="font-semibold text-accent hover:underline">View in Record</a></>}
                  </Banner>
                )}
                {phase === 'closing' && (
                  <Banner tone="warn" title="Closing soon.">
                    {mode === 'live' ? 'The market closes' : 'Practice ends'}{left ? ` in ${left}` : closes ? ` at ${closes}` : ''}. Open positions close automatically.
                  </Banner>
                )}
                <AccountStrip obs={obs} disabled={!!orderBlock || !obs} onTrade={(side) => openDrawer(side, tab === 'chart' ? activeSymbol : drawer?.symbol ?? activeSymbol)} />
              </>
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
                onTrade={!sess || orderBlock ? undefined : openDrawer}
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
            ) : !sess ? null : !obs ? (
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
              <TradesTab trades={obs.recent_trades} degraded={obs.trades_degraded} fmtFor={book.fmtFor} tz={tz ?? 'UTC'} />
            ) : (
              <PnlTab balance={obs.balance} trades={obs.recent_trades} degraded={obs.trades_degraded} />
            )}
          </>
        )}
      </main>

      <OrderDrawer
        state={sess ? drawer : null}
        instruments={book.instruments}
        obs={obs}
        blockedReason={!sess ? 'You are not in a session, so orders are off.' : orderBlock}
        entry={entry}
        onSymbol={(sym) => {
          entry.reset()
          setDrawer((d) => (d ? { ...d, symbol: sym } : d))
        }}
        onClose={() => setDrawer(null)}
      />
      {session.prompt && (
        <ConfirmDialog
          open
          tone="danger"
          {...switchCopy(session.prompt.from.mode, session.prompt.target.kind, undefined)}
          cancelLabel="Stay"
          onCancel={session.cancelSwitch}
          onConfirm={() => {
            setDrawer(null)
            void session.confirmSwitch()
          }}
        />
      )}
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
