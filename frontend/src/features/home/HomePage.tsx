import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { observationKey, useMarkets, useObservation, type Observation, type TransferDirection, type TransferResponse } from '../../api'
import { Banner, Button, Card, ConfirmDialog, Skeleton, TopBar } from '../../components'
import { getAccountId } from '../../lib/account'
import { liveCardView } from '../../lib/liveCard'
import { useMarketClock } from '../../lib/marketClock'
import { pickMarket, useSelectedMarket } from '../../lib/selectedMarket'
import { closeLabel, switchCopy } from '../../lib/session'
import { formatMoney } from '../../lib/ticks'
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
  const accountId = getAccountId()
  const qc = useQueryClient()
  const marketsQ = useMarkets({ refetchMs: 5000 })
  const markets = marketsQ.data?.markets ?? []
  const chosen = useSelectedMarket((s) => s.code)
  const selectMarket = useSelectedMarket((s) => s.select)
  const market = pickMarket(markets, chosen)

  // Join / start enter the Terminal on success; the one-session rule (409 -> confirm -> exit -> enter) lives in the flow.
  const session = useSessionFlow(accountId, market?.code, { onEntered: () => go('/terminal') })
  const sess = session.active
  const obsQ = useObservation(accountId, !!sess)
  const obs: Observation | undefined = sess ? obsQ.data : undefined
  const nowLocal = useMarketClock(market?.timezone) // the UI runs the market clock itself

  const [transferOpen, setTransferOpen] = useState(false)
  const [afterTransfer, setAfterTransfer] = useState<{ trading: number; bank: number } | undefined>()
  const [notice, setNotice] = useState<string>()

  const trading = obs?.balance.available ?? afterTransfer?.trading
  const bank = obs?.balance.bank ?? afterTransfer?.bank
  const source = obs ? 'session' : afterTransfer ? 'transfer' : 'none'

  const onTransferDone = (res: TransferResponse, direction: TransferDirection, amount: number) => {
    setAfterTransfer({ trading: res.available, bank: res.bank })
    qc.setQueryData<Observation>(observationKey(accountId), (o) => (o ? { ...o, balance: { ...o.balance, available: res.available, bank: res.bank } } : o))
    void qc.invalidateQueries({ queryKey: observationKey(accountId) })
    setNotice(`${formatMoney(amount)} moved ${direction === 'to_bank' ? 'to your bank balance' : 'to your trading balance'}.`)
    setTransferOpen(false)
  }

  const loading = (marketsQ.isPending && !marketsQ.data) || (!session.known && !session.loadError)
  const liveView =
    market &&
    liveCardView({
      phase: market.live_session.phase,
      opensAt: market.live_session.opens_at,
      closesAt: market.live_session.closes_at,
      now: nowLocal,
      inLive: sess?.type === 'live' && sess.market === market.code,
    })

  return (
    <div className="min-h-screen bg-bg text-ink">
      <TopBar
        markets={markets.map((m) => ({ code: m.code, name: m.name }))}
        market={market?.code ?? ''}
        onMarketChange={selectMarket}
        marketsLoading={marketsQ.isPending}
        accountLabel={accountId}
        accountItems={[
          { label: 'Home', onSelect: () => {} },
          { label: 'Terminal', onSelect: () => go('/terminal') },
          { label: 'Record', onSelect: () => go('/record') },
        ]}
      />
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 pb-10 pt-6 sm:px-6">
        <h1 className="sr-only">Home</h1>

        {sess && (
          <Banner
            tone="info"
            title={`You're in a ${sess.type} session.`}
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
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]" role="status">
            <span className="sr-only">Loading</span>
            <div className="space-y-5"><Card><Skeleton className="h-52 w-full" /></Card><Card><Skeleton className="h-32 w-full" /></Card></div>
            <Card><Skeleton className="h-64 w-full" /></Card>
          </div>
        ) : market && liveView ? (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              <LiveCard
                marketName={market.name}
                window={`${closeLabel(market.live_session.opens_at)} – ${closeLabel(market.live_session.closes_at)} · ${market.timezone}`}
                view={liveView}
                busy={session.busy === 'enter'}
                onJoin={() => void session.enter({ kind: 'live' })}
                onReturn={() => go('/terminal')}
              />
              <PracticeCard
                marketName={market.name}
                inPractice={sess?.type === 'practice'}
                note={session.notice?.code === 'low_balance' ? 'Paused until your trading balance is above the minimum.' : undefined}
                busy={session.busy === 'enter'}
                onStart={() => void session.enter({ kind: 'practice', condition: 'normal_day', length: 90 })}
                onReturn={() => go('/terminal')}
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
      {session.prompt && <SwitchConfirm session={session} />}
    </div>
  )
}


function SwitchConfirm({ session }: { session: ReturnType<typeof useSessionFlow> }) {
  const p = session.prompt!
  return (
    <ConfirmDialog
      open
      tone="danger"
      {...switchCopy(p.from.type, p.target.kind, closeLabel(p.from.closes_at))}
      cancelLabel="Stay"
      onCancel={session.cancelSwitch}
      onConfirm={() => void session.confirmSwitch()}
    />
  )
}
