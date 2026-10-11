import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useObservation, type CandleTimeframe, type OpenOrder } from '../../api'
import { Banner, Button, Card, ConfirmDialog, Num, SessionBar, SkeletonText, TopBar } from '../../components'
import { getAccountId } from '../../lib/account'
import { useMarketClock } from '../../lib/marketClock'
import { useMarketStore } from '../../lib/marketStore'
import type { Side } from '../../lib/orderTicket'
import { clockOf, closeLabel, conditionLabel, exitCopy, orderBlockReason, switchCopy, timeLeft } from '../../lib/session'
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
  const accountId = getAccountId()

  const m = useTerminalMarket()
  const book = useInstrumentBook(m.market?.code)
  const status = useMarketStore((s) => s.status)
  const snapshots = useMarketStore((s) => s.snapshots)

  // Keep a live price for every instrument in the list (the watchlist), on one socket.
  useSubscriptions(book.instruments.map((i) => ({ stream: 'snapshot' as const, instrument: i.instrument })))

  // ---- session (HTTP poll): which session the account is in, and the way in / out
  const session = useSessionFlow(accountId, m.market?.code)
  const sess = session.active
  const noSession = session.known && !sess

  // ---- account half (HTTP poll) — only meaningful inside a session (otherwise it answers 409)
  const obsQ = useObservation(accountId, !!sess)
  const obs = sess ? obsQ.data : undefined
  const obsFailed = !!sess && !!obsQ.error
  const entry = useOrderEntry(accountId, obs, obsQ.dataUpdatedAt)
  const actions = useOrderActions(accountId)
  const [drawer, setDrawer] = useState<OrderDrawerState | null>(null)
  const [modifying, setModifying] = useState<OpenOrder | null>(null)
  const openDrawer = (side: Side, sym: string) => {
    entry.reset()
    setDrawer((d) => ({ side, symbol: sym, n: (d?.n ?? 0) + 1 }))
  }

  const activeSymbol = symbol && book.instruments.some((i) => i.instrument === symbol) ? symbol : book.instruments[0]?.instrument

  // Market phase. Live: the snapshots (the socket is the live source), falling back to the session
  // then the markets list. Practice runs its own clock, so its phase is the session's.
  const livePhase = (activeSymbol && snapshots[activeSymbol]?.phase) || m.market?.live_session.phase
  const phase = sess?.type === 'practice' ? sess.phase : livePhase ?? sess?.phase
  useEffect(() => {
    // A phase change moves "today's" session window: refresh it so the live bar's bucket is right.
    if (phase) void queryClient.invalidateQueries({ queryKey: ['markets'] })
  }, [phase, queryClient])

  const mode = sess?.type
  const orderBlock = mode ? orderBlockReason(phase, mode) : undefined
  const closes = closeLabel(sess?.closes_at)
  const nowLocal = useMarketClock(sess ? m.market?.timezone : undefined) // the UI runs the clock itself
  // Past the close on the local clock but the backend still says trading: the two disagree (e.g. the
  // mock's simulated day), so show the close time rather than a misleading 0:00:00.
  const rawLeft = timeLeft(nowLocal, sess?.closes_at)
  const left = phase === 'closed' ? '0:00:00' : rawLeft === '0:00:00' ? undefined : rawLeft
  const realised = obs && !obs.trades_degraded ? obs.recent_trades.reduce((sum, t) => sum + t.net_pnl, 0) : 0

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
          { label: 'Home', onSelect: () => window.location.assign('/') },
          { label: 'Terminal', onSelect: () => {} },
          { label: 'Record', onSelect: () => window.location.assign('/record') },
        ]}
      />

      {sess && (
        <SessionBar
          mode={sess.type}
          market={m.market?.name ?? sess.market}
          phase={(phase ?? sess.phase) as 'preopen' | 'open' | 'closing' | 'closed'}
          clock={clockOf(nowLocal)}
          remainingLabel={left ? 'Time left' : 'Closes'}
          remaining={left ?? closes}
          timezone={m.market?.timezone ?? ''}
          condition={conditionLabel(sess.condition)}
          stats={[
            { label: 'P&L · latest trades', value: <Num kind="signed-money" value={realised} available={!!obs && !obs.trades_degraded} /> },
            { label: 'Open positions', value: <Num kind="qty" value={obs?.positions.filter((p) => p.qty !== 0).length ?? 0} available={!!obs} /> },
          ]}
          actions={
            <Button
              variant="ghost"
              disabled={!!session.busy}
              onClick={() => void session.enter(sess.type === 'live' ? { kind: 'practice', condition: 'normal_day', length: 90 } : { kind: 'live' })}
            >
              {sess.type === 'live' ? 'Start practice' : 'Join live'}
            </Button>
          }
          confirm={exitCopy(sess.type, closes)}
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
                marketName={m.market.name}
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
              <TradesTab trades={obs.recent_trades} degraded={obs.trades_degraded} fmtFor={book.fmtFor} tz={m.market.timezone} />
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
          {...switchCopy(session.prompt.from.type, session.prompt.target.kind, closeLabel(session.prompt.from.closes_at))}
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
