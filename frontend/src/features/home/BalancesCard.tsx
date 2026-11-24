import { Button, Card, Num } from '../../components'

/**
 * Trading balance and Bank balance: global, one unit ("units"), not per market. In a session
 * they come from `observation`; outside one they come from `GET /v1/account/cash` (the real
 * backend's pre-session money view — BACKEND-INTEGRATION-PLAN.md §3's locked Home-load
 * sequencing: resolve session state first, then call balance or cash, never both).
 */
export function BalancesCard({
  trading, bank, source, onTransfer,
}: {
  trading: number | undefined
  bank: number | undefined
  /** Where the figures came from, for the footnote. */
  source: 'session' | 'cash' | 'transfer' | 'none'
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
      {source === 'none' && <p className="text-sm text-muted">Balances are loading.</p>}
      {source === 'cash' && <p className="text-sm text-muted">As of now. They switch to your live session balance once you join one.</p>}
      {source === 'transfer' && <p className="text-sm text-muted">As of your last transfer.</p>}
      <Button variant="ghost" onClick={onTransfer}>Transfer</Button>
    </Card>
  )
}
