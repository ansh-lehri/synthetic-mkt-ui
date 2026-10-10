import type { InfiniteData, UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query'
import type { CostsPage, CostsSummary, CostsTrade, PnlSummary, Trade } from '../../api'
import { Banner, Button, Card, EmptyState, Num, SkeletonText } from '../../components'
import { costLabel, costShortLabel } from './labels'
import { formatDay } from './range'
import { isNotImplemented } from './errors'
import { QueryError } from './QueryError'

const TH = 'px-4 py-3 text-xs font-semibold text-muted'

export interface TaxSectionProps {
  marketName: string
  /** Market code, i.e. the `country` sent to /costs*. */
  country: string
  tz: string
  summary: UseQueryResult<CostsSummary, unknown>
  pnl: UseQueryResult<PnlSummary, unknown>
  costs: UseInfiniteQueryResult<InfiniteData<CostsPage>, unknown>
  /** Trades by id, to give each cost row its date and symbol (the cost rows carry only an id). */
  tradesById: Map<string, Trade>
  /** Rows already filtered to the selected period. */
  rows: CostsTrade[]
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}

function AggregateRow({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
      <span className={strong ? 'font-semibold' : 'text-ink'}>{label}</span>
      <span className={strong ? 'font-semibold' : ''}>{children}</span>
    </div>
  )
}

/** Tax / cost breakdown for the selected market (IN only today; US is an honest 501). */
export function TaxSection(p: TaxSectionProps) {
  const unsupported = isNotImplemented(p.summary.error) || isNotImplemented(p.costs.error)
  if (unsupported) {
    return (
      <Banner tone="warn" title={`Tax and costs aren't available for ${p.marketName} yet`}>
        The tax and cost breakdown is only implemented for India for now. Your trades and P&amp;L are unaffected.
      </Banner>
    )
  }

  return (
    <>
      <Card as="section" aria-label="Cost summary" flush className="overflow-hidden">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4">
          <span className="font-semibold">{p.marketName} tax</span>
          <span className="text-muted">·</span>
          <span>All time</span>
        </div>
        {p.summary.isError ? (
          <div className="px-5 pb-4">
            <QueryError title="Could not load the cost summary" error={p.summary.error} onRetry={() => void p.summary.refetch()} />
          </div>
        ) : !p.summary.data ? (
          <div className="px-5 pb-5"><SkeletonText lines={4} label="Loading cost summary" /></div>
        ) : (
          <>
            {p.pnl.data && (
              <AggregateRow label="Gross P&L"><Num kind="signed-money" value={p.pnl.data.gross_pnl} label={false} /></AggregateRow>
            )}
            {p.summary.data.lines.map((l) => (
              <AggregateRow key={l.name} label={costLabel(l.name)}><Num kind="money" value={l.amount} label={false} /></AggregateRow>
            ))}
            {p.summary.data.lines.length === 0 && (
              <p className="border-t border-line px-5 py-3 text-sm text-muted">No costs have been charged yet.</p>
            )}
            <AggregateRow label="Total costs" strong><Num kind="money" value={p.summary.data.total} label={false} /></AggregateRow>
            {p.pnl.data && (
              <AggregateRow label="Net result" strong><Num kind="signed-money" value={p.pnl.data.net_pnl} label={false} /></AggregateRow>
            )}
          </>
        )}
        <p className="border-t border-line px-5 py-3 text-sm text-muted">
          Amounts are in units. Lines follow {p.marketName}&apos;s tax rules. This summary covers all your trades; the list below follows the dates above.
        </p>
      </Card>

      {p.costs.isError ? (
        <QueryError title="Could not load per-trade costs" error={p.costs.error} onRetry={() => void p.costs.refetch()} />
      ) : !p.costs.data ? (
        <Card as="section" aria-label="Per-trade costs"><SkeletonText lines={5} label="Loading per-trade costs" /></Card>
      ) : p.rows.length === 0 ? (
        <Card as="section" aria-label="Per-trade costs">
          <EmptyState title="No costs in this period" description="Closed trades in the selected dates, with their charges, will appear here." />
        </Card>
      ) : (
        <Card as="section" aria-label="Per-trade costs" flush className="overflow-hidden">
          <div className="px-5 py-4">
            <span className="font-semibold">Costs per trade</span>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">Charges for each closed trade, newest first. Only charges above zero are listed. Amounts are in units.</caption>
              <thead>
                <tr className="border-t border-line text-left">
                  <th scope="col" className={TH}>Date</th>
                  <th scope="col" className={TH}>Symbol</th>
                  <th scope="col" className={TH}>Charges</th>
                  <th scope="col" className={`${TH} text-right`}>Total (units)</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((c) => {
                  const t = p.tradesById.get(c.trade_id)
                  return (
                    <tr key={c.trade_id} className="border-t border-line align-top">
                      <td className="whitespace-nowrap px-4 py-3">{t ? formatDay(t.exit_at, p.tz) : <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3 font-semibold">{t ? t.instrument : <span className="font-normal text-muted">{c.trade_id}</span>}</td>
                      <td className="px-4 py-3">
                        {c.lines.length === 0 ? (
                          <span className="text-muted">No charges</span>
                        ) : (
                          <ul className="flex flex-wrap gap-x-4 gap-y-1">
                            {c.lines.map((l) => (
                              <li key={l.name} className="whitespace-nowrap">
                                <span className="text-muted">{costShortLabel(l.name)}</span>{' '}
                                <Num kind="money" value={l.amount} label={false} size="sm" />
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right"><Num kind="money" value={c.total} label={false} className="font-semibold" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <span className="text-sm text-muted">{p.hasMore ? 'Older trades are available.' : 'End of the selected period.'}</span>
            {p.hasMore && (
              <Button variant="ghost" loading={p.loadingMore} onClick={p.onLoadMore}>
                Load older trades
              </Button>
            )}
          </div>
        </Card>
      )}
    </>
  )
}
