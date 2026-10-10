import type { Trade } from '../../api'
import { Button, Card, Num } from '../../components'
import type { PriceFormat } from '../../lib/ticks'
import { exitReasonTag } from './labels'
import { formatDay, formatTime } from './range'

const TH = 'px-4 py-3 text-xs font-semibold text-muted'

export interface TradesTableProps {
  trades: Trade[]
  /** Price formatting for an instrument, or null while unknown (prices then show "—"). */
  fmtFor: (symbol: string) => PriceFormat | null
  /** Market timezone: dates and times are shown in it. */
  tz: string
  marketName: string
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}

/** Closed trades, newest first (one row per closed round trip). Walks older pages on demand. */
export function TradesTable({ trades, fmtFor, tz, marketName, hasMore, loadingMore, onLoadMore }: TradesTableProps) {
  return (
    <Card as="section" aria-label="Closed trades" flush className="overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4">
        <span className="font-semibold">{marketName}</span>
        <span className="text-muted">·</span>
        <span>
          {trades.length} closed trade{trades.length === 1 ? '' : 's'} shown
        </span>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <caption className="sr-only">Closed trades, newest first. Amounts are in units.</caption>
          <thead>
            <tr className="border-t border-line text-left">
              <th scope="col" className={TH}>Date</th>
              <th scope="col" className={TH}>Time</th>
              <th scope="col" className={TH}>Symbol</th>
              <th scope="col" className={TH}>Side</th>
              <th scope="col" className={`${TH} text-right`}>Qty</th>
              <th scope="col" className={`${TH} text-right`}>Entry</th>
              <th scope="col" className={`${TH} text-right`}>Exit</th>
              <th scope="col" className={`${TH} text-right`}>Net P&amp;L (units)</th>
              <th scope="col" className={`${TH} text-right`}>Return</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const fmt = fmtFor(t.instrument)
              const tag = exitReasonTag(t.exit_reason)
              const long = t.direction === 'long'
              return (
                <tr key={t.trade_id} className="min-h-[52px] border-t border-line">
                  <td className="whitespace-nowrap px-4 py-3">{formatDay(t.exit_at, tz)}</td>
                  <td className="tnum whitespace-nowrap px-4 py-3">{formatTime(t.exit_at, tz)}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold">{t.instrument}</span>
                    {tag && <span className="ml-2 rounded-pill border border-line px-2 py-0.5 text-xs text-muted">{tag}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold ${long ? 'bg-gainBg text-gain' : 'bg-lossBg text-loss'}`}
                    >
                      <span aria-hidden="true">{long ? '▲' : '▼'}</span>
                      {long ? 'Long' : 'Short'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right"><Num kind="qty" value={t.quantity} /></td>
                  <td className="px-4 py-3 text-right">
                    {fmt ? <Num kind="price" value={t.entry_price} fmt={fmt} /> : <Num kind="price" value={0} fmt={{ tick_size: 1, price_decimals: 0 }} available={false} />}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {fmt ? <Num kind="price" value={t.exit_price} fmt={fmt} /> : <Num kind="price" value={0} fmt={{ tick_size: 1, price_decimals: 0 }} available={false} />}
                  </td>
                  <td className="px-4 py-3 text-right"><Num kind="signed-money" value={t.net_pnl} label={false} className="font-semibold" /></td>
                  <td className="px-4 py-3 text-right"><Num kind="percent" value={t.pnl_pct} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-sm text-muted">{hasMore ? 'Older trades are available.' : 'End of the selected period.'}</span>
        {hasMore && (
          <Button variant="ghost" loading={loadingMore} onClick={onLoadMore}>
            Load older trades
          </Button>
        )}
      </div>
    </Card>
  )
}
