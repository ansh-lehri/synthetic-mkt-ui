import { useState } from 'react'
import { useMarkets, type PracticeCondition, type PracticeLength } from '../../api'
import { Banner, Button, Card, Num, TopBar } from '../../components'
import { getAccountId } from '../../lib/account'
import { pickMarket, useSelectedMarket } from '../../lib/selectedMarket'
import { DEFAULT_CONDITION, DEFAULT_LENGTH, PRACTICE_CONDITIONS, PRACTICE_LENGTHS, conditionLabel } from '../../lib/session'
import { TransferDialog } from '../home/TransferDialog'
import { SwitchConfirm } from '../session/SwitchConfirm'
import { useSessionFlow } from '../session/useSessionFlow'

const go = (path: string) => window.location.assign(path)

const radioCard =
  'flex min-h-[44px] w-full cursor-pointer flex-col gap-1 rounded-lg border p-4 text-left peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus'

/**
 * Practice setup: pick the market conditions and the length, see what you are about to start, start.
 * The market is the top bar's dropdown (shown here, not chosen). Starting posts
 * `/v1/session/practice/start`, then goes to the Terminal in practice mode. Practice trades a COPY of
 * the trading balance: profit or loss is not added to it, and nothing is recorded.
 */
export default function PracticePage() {
  const accountId = getAccountId()
  const marketsQ = useMarkets({ refetchMs: 15_000 })
  const markets = marketsQ.data?.markets ?? []
  const chosen = useSelectedMarket((s) => s.code)
  const selectMarket = useSelectedMarket((s) => s.select)
  const market = pickMarket(markets, chosen)

  const [condition, setCondition] = useState<PracticeCondition>(DEFAULT_CONDITION)
  const [length, setLength] = useState<PracticeLength>(DEFAULT_LENGTH)
  const [transferOpen, setTransferOpen] = useState(false)
  const [balance, setBalance] = useState<number>() // known only after a transfer here (see the note on the card)
  const [funded, setFunded] = useState(false) // a transfer went through after a low-balance refusal

  const session = useSessionFlow(accountId, market?.code, { onEntered: () => go('/terminal') })
  const sess = session.active
  const starting = session.busy === 'enter'
  const lowBalance = session.notice?.code === 'low_balance' && !funded
  const failed = session.notice?.tone === 'error'

  const start = () => {
    setFunded(false)
    void session.enter({ kind: 'practice', condition, length })
  }

  if (starting) {
    // Honest wait: one spinner and the choice being started. No made-up progress steps.
    return (
      <div className="min-h-screen bg-bg text-ink">
        <main className="mx-auto flex min-h-screen w-full max-w-[77.5rem] flex-col items-center justify-center gap-6 px-4 text-center">
          <span aria-hidden="true" className="inline-block h-14 w-14 animate-spin rounded-full border-4 border-line border-t-accent motion-reduce:animate-none" />
          <div className="space-y-2" role="status">
            <h1 className="text-2xl font-semibold tracking-tight">Starting your practice session…</h1>
            <p className="text-muted">
              {market?.name}, {conditionLabel(condition)}, {length} min
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <TopBar
        markets={markets.map((m) => ({ code: m.code, name: m.name }))}
        market={market?.code ?? ''}
        onMarketChange={selectMarket}
        marketsLoading={marketsQ.isPending}
        accountLabel={accountId}
        accountItems={[
          { label: 'Home', onSelect: () => go('/') },
          { label: 'Terminal', onSelect: () => go('/terminal') },
          { label: 'Record', onSelect: () => go('/record') },
        ]}
      />
      <main className="mx-auto flex w-full max-w-[77.5rem] flex-col gap-6 px-4 pb-12 pt-6 sm:px-6">
        <a href="/" className="inline-flex min-h-[44px] items-center gap-1 self-start text-sm font-semibold text-accent hover:underline">
          <span aria-hidden="true">←</span> Home
        </a>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Practice setup</h1>
          <p className="text-muted">Trade against agents. Nothing from practice is recorded.</p>
        </div>

        {sess && (
          <Banner
            tone="info"
            title={`You're in a ${sess.type} session.`}
            action={<Button variant="ghost" onClick={() => go('/terminal')}>Return to session</Button>}
          >
            Starting practice will ask you to leave it first.
          </Banner>
        )}
        {marketsQ.error && !marketsQ.data && (
          <Banner tone="error" title="Could not load the markets" action={<Button variant="ghost" onClick={() => void marketsQ.refetch()}>Retry</Button>}>
            {marketsQ.error instanceof Error ? marketsQ.error.message : 'Something went wrong.'}
          </Banner>
        )}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21.25rem]">
          <div className="flex flex-col gap-8">
            <fieldset>
              <legend className="mb-3 text-base font-semibold">Market conditions</legend>
              <div role="radiogroup" aria-label="Market conditions" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {PRACTICE_CONDITIONS.map((c) => (
                  <label key={c.value} className="relative flex">
                    <input type="radio" name="condition" value={c.value} checked={condition === c.value} onChange={() => setCondition(c.value)} className="peer sr-only" />
                    <span className={`${radioCard} ${condition === c.value ? 'border-accent bg-soft' : 'border-line bg-panel hover:bg-raised'}`}>
                      <span className="flex items-center gap-2 font-semibold">
                        <span aria-hidden="true" className={`inline-flex h-4 w-4 items-center justify-center rounded-pill border ${condition === c.value ? 'border-accent' : 'border-muted'}`}>
                          {condition === c.value && <span className="h-2 w-2 rounded-pill bg-accent" />}
                        </span>
                        {c.label}
                      </span>
                      <span className="text-sm text-muted">{c.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-3 text-base font-semibold">Length</legend>
              <div role="radiogroup" aria-label="Length" className="flex flex-wrap gap-2.5">
                {PRACTICE_LENGTHS.map((n) => (
                  <label key={n} className="relative block">
                    <input type="radio" name="length" value={n} checked={length === n} onChange={() => setLength(n)} className="peer sr-only" />
                    <span className={`inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-pill border px-5 text-sm font-semibold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${length === n ? 'border-accent bg-soft' : 'border-line bg-panel hover:bg-raised'}`}>
                      {length === n && <span aria-hidden="true">✓</span>}
                      {n} min
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <Card as="aside" aria-labelledby="sum-h" className="border-dashed !border-muted" bodyClassName="space-y-5 !p-5">
            <h2 id="sum-h" className="text-base font-semibold">Your practice</h2>
            <dl className="divide-y divide-line text-sm">
              {[
                ['Market', market?.name ?? '—'],
                ['Conditions', conditionLabel(condition) ?? '—'],
                ['Length', `${length} min`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 py-2.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-semibold" data-testid={`sum-${k.toLowerCase()}`}>{v}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="text-muted">Trading balance</dt>
                <dd className="font-semibold" data-testid="sum-stake"><Num kind="money" value={balance ?? 0} available={balance !== undefined} /></dd>
              </div>
            </dl>
            {balance === undefined && (
              <p className="text-sm text-muted">Your stake is a copy of your trading balance, taken when practice starts. It cannot be read before then.</p>
            )}

            {lowBalance && (
              <Banner tone="warn" title="Your trading balance is below the minimum for practice">
                Practice is blocked until you add funds.
              </Banner>
            )}
            {funded && <Banner tone="success">Funds added. You can start practice now.</Banner>}
            {failed && session.notice && (
              <Banner tone="error" title={session.notice.title} onDismiss={session.dismiss}>{session.notice.body}</Banner>
            )}
            {session.notice && !lowBalance && !failed && (
              <Banner tone={session.notice.tone} title={session.notice.title} onDismiss={session.dismiss}>{session.notice.body}</Banner>
            )}

            {lowBalance ? (
              <Button variant="primary" fullWidth onClick={() => setTransferOpen(true)}>Transfer money</Button>
            ) : (
              <Button variant="primary" fullWidth disabled={!market} onClick={start}>{failed ? 'Try again' : 'Start practice'}</Button>
            )}
            <p className="text-sm text-muted">
              You trade with a copy of your trading balance. Profit or loss here is not added to your balance. Not recorded.
            </p>
          </Card>
        </div>
      </main>

      <TransferDialog
        open={transferOpen}
        accountId={accountId}
        known={{}}
        onClose={() => setTransferOpen(false)}
        onDone={(res) => {
          setBalance(res.available)
          setFunded(true)
          setTransferOpen(false)
          session.dismiss()
        }}
        onUnknown={() => undefined}
      />
      <SwitchConfirm session={session} />
    </div>
  )
}
