import type { UseQueryResult } from '@tanstack/react-query'
import type { PnlSummary } from '../../api'
import { Card, Num, Skeleton } from '../../components'
import { QueryError } from './QueryError'

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-[8rem] flex-col gap-1">
      <dt className="text-sm text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/**
 * Account-wide P&L aggregate (GET /v1/account/pnl). An empty account is a zero-filled 200,
 * not an error. Win/loss are by NET result; a trade that nets to exactly zero is counted in
 * neither.
 */
export function PnlSummaryCard({ query }: { query: UseQueryResult<PnlSummary, unknown> }) {
  if (query.isError) return <QueryError title="Could not load your P&L summary" error={query.error} onRetry={() => void query.refetch()} />

  const d = query.data
  return (
    <Card as="section" aria-label="P&L summary">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
        <h2 className="text-sm font-semibold">P&amp;L summary</h2>
        <span className="text-sm text-muted">All time</span>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-4 px-5 py-4">
        <Stat label="Closed trades">{d ? <Num kind="qty" value={d.trade_count} size="lg" /> : <Skeleton className="h-6 w-12" />}</Stat>
        <Stat label="Gross P&L">{d ? <Num kind="signed-money" value={d.gross_pnl} size="lg" label={false} /> : <Skeleton className="h-6 w-24" />}</Stat>
        <Stat label="Costs">{d ? <Num kind="money" value={d.total_costs} size="lg" label={false} /> : <Skeleton className="h-6 w-20" />}</Stat>
        <Stat label="Net P&L">{d ? <Num kind="signed-money" value={d.net_pnl} size="lg" label={false} className="font-semibold" /> : <Skeleton className="h-6 w-24" />}</Stat>
        <Stat label="Wins">{d ? <Num kind="qty" value={d.win_count} size="lg" /> : <Skeleton className="h-6 w-10" />}</Stat>
        <Stat label="Losses">{d ? <Num kind="qty" value={d.loss_count} size="lg" /> : <Skeleton className="h-6 w-10" />}</Stat>
      </dl>
      <p className="border-t border-line px-5 py-3 text-sm text-muted">
        Amounts are in units. A win or loss is by net result after costs; a trade that nets to zero counts as neither.
      </p>
    </Card>
  )
}
