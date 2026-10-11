import { Button, Card, Num } from '../../components'

/**
 * Trading balance and Bank balance: global, one unit ("units"), not per market. They come from the
 * account read (`observation`), which needs a session — outside one we show "—" (or the balances a
 * transfer just returned) and say why, rather than a made-up number.
 */
export function BalancesCard({
  trading, bank, source, onTransfer,
}: {
  trading: number | undefined
  bank: number | undefined
  /** Where the figures came from, for the footnote. */
  source: 'session' | 'transfer' | 'none'
  onTransfer: () => void
}) {
  return (
    <Card as="section" aria-labelledby="bal-h" bodyClassName="space-y-5 !p-5">
      <h2 id="bal-h" className="text-base font-semibold">Balances</h2>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted">Trading balance</span>
        <span className="text-3xl font-semibold" data-testid="bal-trading"><Num kind="money" value={trading ?? 0} available={trading !== undefined} size="xl" /></span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted">Bank balance</span>
        <span className="text-3xl font-semibold" data-testid="bal-bank"><Num kind="money" value={bank ?? 0} available={bank !== undefined} size="xl" /></span>
      </div>
      {source === 'none' && <p className="text-sm text-muted">Balances load when you are in a session.</p>}
      {source === 'transfer' && <p className="text-sm text-muted">As of your last transfer. They refresh when you are in a session.</p>}
      <Button variant="ghost" onClick={onTransfer}>Transfer</Button>
    </Card>
  )
}
