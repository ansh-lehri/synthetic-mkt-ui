import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { observationKey, useMarkets, useObservation, type Observation, type TransferDirection, type TransferResponse } from '../../api'
import { Banner, Button, Card, Skeleton, TopBar } from '../../components'
import { logout, requireAccountId, requireEmail, useCash } from '../../lib/identity'
import { getStoredGuestId, isGuestEmail } from '../../lib/guestIdentity'
import { getGuestQuota } from '../../api/landing'
import { liveCardView } from '../../lib/liveCard'
import { instantToNaiveLocal, useMarketClock } from '../../lib/marketClock'
import { marketName, marketTimezone } from '../../lib/marketTimezone'
import { pickMarket, useSelectedMarket } from '../../lib/selectedMarket'
import { closeLabel } from '../../lib/session'
import { formatMoney } from '../../lib/ticks'
import { SwitchConfirm } from '../session/SwitchConfirm'
import { useSessionFlow } from '../session/useSessionFlow'
import { BalancesCard } from './BalancesCard'
import { LiveCard } from './LiveCard'
import { PracticeCard } from './PracticeCard'
import { TransferDialog } from './TransferDialog'

const go = (path: string) => window.location.assign(path)

/**
 * Home — the hub. The market card (hours, countdown, phase, join), the practice entry, global
 * balances with Transfer, and the "you're in a session" strip. The market is the top bar's
 * dropdown; switching it changes only the live card and the practice label (balances are global).
 */
export default function HomePage() {
  const accountId = requireAccountId()
  const email = requireEmail()
  const qc = useQueryClient()
  const marketsQ = useMarkets({ refetchMs: 5000 })
  const markets = marketsQ.data?.markets ?? []
  const chosen = useSelectedMarket((s) => s.code)
  const selectMarket = useSelectedMarket((s) => s.select)
  const market = pickMarket(markets, chosen)
  const tz = market ? marketTimezone(market.tag) : undefined

  // Join / start enter the Terminal on success; the one-session rule (409 -> confirm -> exit -> enter) lives in the flow.
  const session = useSessionFlow(email ?? '', market?.tag, { onEntered: () => go('/terminal') })
  const sess = session.active
  const obsQ = useObservation(accountId ?? '', !!sess && !!accountId)
  const obs: Observation | undefined = sess ? obsQ.data : undefined
  // Home-load sequencing (BACKEND-INTEGRATION-PLAN.md §3, locked): once session state is
  // known (session.known, from useSessionFlow's own resolveCurrentSession call — not an
  // extra round trip), call balance (via observation) if active, cash if not. Never both.
  const cashQ = useCash(accountId ?? '', session.known && !sess && !!accountId)
  const nowLocal = useMarketClock(tz) // the UI runs the market clock itself

  const [transferOpen, setTransferOpen] = useState(false)
  const [afterTransfer, setAfterTransfer] = useState<{ trading: number; bank: number } | undefined>()
  const [notice, setNotice] = useState<string>()

  // Guest quota — only fetched when the current identity is a guest.
  const isGuest = email ? isGuestEmail(email) : false
  const [guestRemaining, setGuestRemaining] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (!isGuest) return
    const gid = getStoredGuestId()
    if (!gid) return
    void getGuestQuota(gid).then((q) => setGuestRemaining(q.remaining)).catch(() => {})
  }, [isGuest])

  if (!accountId || !email) return null // requireAccountId/requireEmail already redirected to /signup

  const trading = obs?.balance.available ?? afterTransfer?.trading ?? cashQ.data?.trading_cash
  const bank = obs?.balance.bank ?? afterTransfer?.bank ?? cashQ.data?.bank_cash
  const source = obs ? 'session' : afterTransfer ? 'transfer' : cashQ.data ? 'cash' : 'none'

  const onTransferDone = (res: TransferResponse, direction: TransferDirection, amount: number) => {
    setAfterTransfer({ trading: res.available, bank: res.bank })
    qc.setQueryData<Observation>(observationKey(accountId), (o) => (o ? { ...o, balance: { ...o.balance, available: res.available, bank: res.bank } } : o))
    void qc.invalidateQueries({ queryKey: observationKey(accountId) })
    setNotice(`${formatMoney(amount)} moved ${direction === 'to_bank' ? 'to your bank balance' : 'to your trading balance'}.`)
    setTransferOpen(false)
  }

  const loading = (marketsQ.isPending && !marketsQ.data) || (!session.known && !session.loadError)
  // GET /v1/markets carries no phase anymore (real-backend shape change) — the fallback is
  // only used before the clock resolves, which is immediate, so 'preopen' is a safe default.
  const liveView =
    market &&
    tz &&
    liveCardView({
      phase: 'preopen',
      opensAt: instantToNaiveLocal(market.session.opens_at, tz),
      closesAt: instantToNaiveLocal(market.session.closes_at, tz),
      now: nowLocal,
      inLive: sess?.mode === 'live' && sess.market === market.tag,
    })

  return (
    <div className="min-h-screen bg-bg text-ink">
      <TopBar
        markets={markets.map((m) => ({ code: m.tag, name: marketName(m.tag) }))}
        market={market?.tag ?? ''}
        onMarketChange={selectMarket}
        marketsLoading={marketsQ.isPending}
        accountLabel={accountId}
        accountItems={[
          { label: 'Home', onSelect: () => {} },
          { label: 'Terminal', onSelect: () => go('/terminal') },
          { label: 'Record', onSelect: () => go('/record') },
          { label: 'Log out', onSelect: logout },
        ]}
      />
      <main className="mx-auto flex w-full max-w-[77.5rem] flex-col gap-4 px-4 pb-10 pt-6 sm:px-6">
        <h1 className="sr-only">Home</h1>

        {sess && (
          <Banner
            tone="info"
            title={`You're in a ${sess.mode} session.`}
            action={<Button variant="primary" onClick={() => go('/terminal')}>Return to session</Button>}
          />
        )}
        {session.notice && (
          <Banner tone={session.notice.tone} title={session.notice.title} onDismiss={session.dismiss}>
            {session.notice.body}
            {session.notice.code === 'low_balance' && <> <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setTransferOpen(true)}>Transfer</button></>}
          </Banner>
        )}
        {notice && <Banner tone="success" onDismiss={() => setNotice(undefined)}>{notice}</Banner>}
        {marketsQ.error && !marketsQ.data && (
          <Banner tone="error" title="Could not load the markets" action={<Button variant="ghost" onClick={() => void marketsQ.refetch()}>Retry</Button>}>
            {marketsQ.error instanceof Error ? marketsQ.error.message : 'Something went wrong.'}
          </Banner>
        )}
        {session.loadError && (
          <Banner tone="error" title="Could not check your session" action={<Button variant="ghost" onClick={session.refetch}>Retry</Button>}>
            {session.loadError instanceof Error ? session.loadError.message : 'Something went wrong.'}
          </Banner>
        )}

        {loading ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21.25rem]" role="status">
            <span className="sr-only">Loading</span>
            <div className="space-y-5"><Card><Skeleton className="h-52 w-full" /></Card><Card><Skeleton className="h-32 w-full" /></Card></div>
            <Card><Skeleton className="h-64 w-full" /></Card>
          </div>
        ) : market && liveView && tz ? (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21.25rem]">
            <div className="space-y-5">
              <LiveCard
                marketName={marketName(market.tag)}
                window={`${closeLabel(instantToNaiveLocal(market.session.opens_at, tz))} – ${closeLabel(instantToNaiveLocal(market.session.closes_at, tz))} · ${tz}`}
                view={
                  isGuest
                    ? { ...liveView, canJoin: false, note: 'Live sessions require a registered account.' }
                    : session.loadError
                      ? { ...liveView, canJoin: false }
                      : liveView
                }
                onReturn={() => go('/terminal')}
              />
              <PracticeCard
                marketName={marketName(market.tag)}
                inPractice={sess?.mode === 'practice'}
                onStart={() => go('/practice')}
                onReturn={() => go('/terminal')}
                guestRemaining={isGuest ? guestRemaining : undefined}
              />
            </div>
            <aside>
              <BalancesCard trading={trading} bank={bank} source={source} onTransfer={() => setTransferOpen(true)} />
            </aside>
          </div>
        ) : !marketsQ.error ? (
          <Card><p className="text-sm text-muted">No markets are available.</p></Card>
        ) : null}
      </main>

      <TransferDialog
        open={transferOpen}
        accountId={accountId}
        known={{ trading: obs?.balance.available, bank: obs?.balance.bank }}
        onClose={() => setTransferOpen(false)}
        onDone={onTransferDone}
        onUnknown={() => void qc.invalidateQueries({ queryKey: observationKey(accountId) })}
      />
      <SwitchConfirm session={session} />
    </div>
  )
}
