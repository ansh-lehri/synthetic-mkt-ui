import type { Balance, OpenOrder, Position, Trade } from '../../api'
import { Banner, Button, Card, Num, type BannerTone } from '../../components'
import type { PriceFormat } from '../../lib/ticks'
import { formatDay, formatTime } from '../record/range'

// The Terminal's account tabs. Everything here is read from ONE source: the observation poll.
// Amounts are in units (money) or raw prices through the tick formatter.

type FmtFor = (symbol: string) => PriceFormat | null
const NO_FMT: PriceFormat = { tick_size: 1, price_decimals: 0 }

const TH = 'px-4 py-3 text-xs font-semibold text-muted'
const TD = 'px-4 py-3'

function Price({ value, symbol, fmtFor }: { value: number; symbol: string; fmtFor: FmtFor }) {
  const fmt = fmtFor(symbol)
  return <Num kind="price" value={value} fmt={fmt ?? NO_FMT} available={fmt !== null} />
}

function SidePill({ side }: { side: 'buy' | 'sell' }) {
  const buy = side === 'buy'
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold ${buy ? 'bg-gainBg text-gain' : 'bg-lossBg text-loss'}`}>
      <span aria-hidden="true">{buy ? '▲' : '▼'}</span>
      {buy ? 'Buy' : 'Sell'}
    </span>
  )
}

function DirectionPill({ long }: { long: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold ${long ? 'bg-gainBg text-gain' : 'bg-lossBg text-loss'}`}>
      <span aria-hidden="true">{long ? '▲' : '▼'}</span>
      {long ? 'Long' : 'Short'}
    </span>
  )
}

function Head({ title, count, note, actions }: { title: string; count?: number; note?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">
        {title}
        {count !== undefined && <span className="ml-2 font-normal text-muted">({count})</span>}
      </h2>
      <div className="flex items-center gap-3">
        {note && <span className="text-sm text-muted">{note}</span>}
        {actions}
      </div>
    </div>
  )
}

function Empty({ children }: { children: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted">{children}</p>
}

export interface NoticeView {
  tone: BannerTone
  title: string
  body?: string
}

// ---------------------------------------------------------------- Open orders

export function OrdersTab({
  orders, fmtFor, busy, notice, onDismissNotice, onModify, onCancel, onCancelAll,
}: {
  orders: OpenOrder[]
  fmtFor: FmtFor
  busy: ReadonlySet<string>
  notice?: NoticeView
  onDismissNotice: () => void
  onModify: (o: OpenOrder) => void
  onCancel: (id: string) => void
  onCancelAll: () => void
}) {
  const cancellable = orders.filter((o) => !o.cancel_in_flight)
  return (
    <section aria-labelledby="oo-h" className="space-y-3">
      <Head
        title="Open orders"
        count={orders.length}
        actions={<Button variant="ghost" disabled={cancellable.length === 0} onClick={onCancelAll}>Cancel all</Button>}
      />
      {notice && <Banner tone={notice.tone} title={notice.title} onDismiss={onDismissNotice}>{notice.body}</Banner>}
      <Card flush className="overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[51rem] table-fixed border-collapse text-sm" id="oo-h">
            <caption className="sr-only">Open orders. Prices are shown with the instrument&apos;s decimals; amounts in units.</caption>
            {/* fixed columns so the header lines up with the rows, and with itself when there are no rows */}
            <colgroup>
              <col className="w-[11%]" /><col className="w-[16%]" /><col className="w-[15%]" /><col className="w-[10%]" />
              <col className="w-[13%]" /><col className="w-[14%]" /><col className="w-[21%]" />
            </colgroup>
            <thead>
              <tr className="text-left">
                <th scope="col" className={TH}>Side</th>
                <th scope="col" className={TH}>Instrument</th>
                <th scope="col" className={`${TH} text-right`}>Filled / Qty</th>
                <th scope="col" className={TH}>Type</th>
                <th scope="col" className={`${TH} text-right`}>Price</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const working = busy.has(o.order_id)
                const cancelling = o.cancel_in_flight || working
                return (
                  <tr key={o.order_id} className="border-t border-line" data-testid="open-order" data-order-id={o.order_id}>
                    <td className={TD}><SidePill side={o.side} /></td>
                    <td className={`${TD} font-semibold`}>{o.instrument}</td>
                    <td className={`${TD} text-right`}>
                      <Num kind="qty" value={o.filled_qty} /> <span className="text-muted">/</span> <Num kind="qty" value={o.orig_qty} />
                    </td>
                    <td className={TD}>{o.is_market ? 'Market' : 'Limit'}</td>
                    <td className={`${TD} text-right`}>
                      {o.is_market ? <span className="text-muted">Market</span> : <Price value={o.limit_price} symbol={o.instrument} fmtFor={fmtFor} />}
                    </td>
                    <td className={TD}>
                      <span className="font-semibold">{cancelling ? 'Cancelling…' : o.status === 'partially_filled' ? 'Partly filled' : 'Working'}</span>
                    </td>
                    <td className={TD}>
                      <span className="flex justify-end gap-2">
                        <Button variant="ghost" disabled={cancelling || o.is_market} onClick={() => onModify(o)}>Modify</Button>
                        <Button variant="ghost" disabled={cancelling} onClick={() => onCancel(o.order_id)}>Cancel</Button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {orders.length === 0 && <Empty>No open orders.</Empty>}
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------- Positions

export function PositionsTab({ positions, names, fmtFor }: { positions: Position[]; names: (symbol: string) => string; fmtFor: FmtFor }) {
  const open = positions.filter((p) => p.qty !== 0)
  return (
    <section aria-labelledby="po-h" className="space-y-3">
      <Head title="Open positions" count={open.length} />
      <Card flush className="overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm" id="po-h">
            <caption className="sr-only">Open positions with quantity and average entry price.</caption>
            <thead>
              <tr className="text-left">
                <th scope="col" className={TH}>Instrument</th>
                <th scope="col" className={`${TH} text-right`}>Qty</th>
                <th scope="col" className={`${TH} text-right`}>Avg price</th>
                <th scope="col" className={`${TH} text-right`}>Reserved</th>
              </tr>
            </thead>
            <tbody>
              {open.map((p) => (
                <tr key={p.instrument} className="border-t border-line" data-testid="position">
                  <td className={TD}>
                    <span className="flex flex-col"><span className="font-semibold">{p.instrument}</span><span className="text-sm text-muted">{names(p.instrument)}</span></span>
                  </td>
                  <td className={`${TD} text-right`}><Num kind="qty" value={p.qty} /></td>
                  <td className={`${TD} text-right`}><Price value={p.weighted_avg_entry} symbol={p.instrument} fmtFor={fmtFor} /></td>
                  <td className={`${TD} text-right`}><Num kind="qty" value={p.reserved_qty} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {open.length === 0 && <Empty>No open positions.</Empty>}
      </Card>
      <p className="text-sm text-muted">
        Last price and live profit and loss are not shown yet — the exchange is not marking open positions. Quantity and average price are real.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------- Trades (recent)

export function TradesTab({ trades, degraded, fmtFor, tz }: { trades: Trade[]; degraded: boolean; fmtFor: FmtFor; tz: string }) {
  const net = trades.reduce((sum, t) => sum + t.net_pnl, 0)
  return (
    <section aria-labelledby="tr-h" className="space-y-3">
      <Head title="Trades" count={degraded ? undefined : trades.length} note="Latest closed trades" />
      {degraded && (
        <Banner tone="warn" title="Recent trades are unavailable right now">
          Your balance, positions and orders are still live. This list returns by itself.
        </Banner>
      )}
      <Card flush className={`overflow-hidden ${degraded ? 'opacity-60' : ''}`} aria-disabled={degraded || undefined}>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm" id="tr-h">
            <caption className="sr-only">Latest closed trades, newest first. Net profit and loss is in units.</caption>
            <thead>
              <tr className="text-left">
                <th scope="col" className={TH}>Date</th>
                <th scope="col" className={TH}>Time</th>
                <th scope="col" className={TH}>Instrument</th>
                <th scope="col" className={TH}>Direction</th>
                <th scope="col" className={`${TH} text-right`}>Qty</th>
                <th scope="col" className={`${TH} text-right`}>Entry</th>
                <th scope="col" className={`${TH} text-right`}>Exit</th>
                <th scope="col" className={`${TH} text-right`}>Net P&amp;L (units)</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.trade_id} className="border-t border-line" data-testid="trade">
                  <td className={`${TD} whitespace-nowrap`}>{formatDay(t.exit_at, tz)}</td>
                  <td className={`${TD} tnum whitespace-nowrap`}>{formatTime(t.exit_at, tz)}</td>
                  <td className={`${TD} font-semibold`}>{t.instrument}</td>
                  <td className={TD}><DirectionPill long={t.direction === 'long'} /></td>
                  <td className={`${TD} text-right`}><Num kind="qty" value={t.quantity} /></td>
                  <td className={`${TD} text-right`}><Price value={t.entry_price} symbol={t.instrument} fmtFor={fmtFor} /></td>
                  <td className={`${TD} text-right`}><Price value={t.exit_price} symbol={t.instrument} fmtFor={fmtFor} /></td>
                  <td className={`${TD} text-right`}><Num kind="signed-money" value={t.net_pnl} label={false} className="font-semibold" /></td>
                </tr>
              ))}
            </tbody>
            {trades.length > 0 && (
              <tfoot>
                <tr className="border-t border-line">
                  <td className={`${TD} font-semibold`} colSpan={7}>Net of the trades shown</td>
                  <td className={`${TD} text-right`}><Num kind="signed-money" value={net} label={false} className="font-semibold" /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {trades.length === 0 && <Empty>{degraded ? 'Unavailable.' : 'No closed trades yet.'}</Empty>}
      </Card>
      <p className="text-sm text-muted">A trade is recorded when a position is closed out — buying alone opens a position, it does not create a trade.</p>
    </section>
  )
}

// ---------------------------------------------------------------- P&L and balance

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="min-w-0">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{children}</p>
    </Card>
  )
}

export function PnlTab({ balance, trades, degraded }: { balance: Balance; trades: Trade[]; degraded: boolean }) {
  const gross = trades.reduce((s, t) => s + t.gross_pnl, 0)
  const costs = trades.reduce((s, t) => s + t.total_costs, 0)
  const net = trades.reduce((s, t) => s + t.net_pnl, 0)
  return (
    <section aria-labelledby="pl-h" className="space-y-4">
      <Head
        title="Profit and loss"
        actions={<a href="/record" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-accent hover:underline">Full record →</a>}
      />
      <div id="pl-h" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={degraded ? 'Realised (unavailable)' : `Realised · latest ${trades.length} trades`}>
          <Num kind="signed-money" value={net} available={!degraded} size="xl" />
        </Stat>
        <Stat label="Gross before costs">
          <Num kind="signed-money" value={gross} available={!degraded} size="xl" />
        </Stat>
        <Stat label="Costs">
          <Num kind="money" value={costs} available={!degraded} size="xl" />
        </Stat>
        <Stat label="Unrealised">
          <Num kind="signed-money" value={0} available={false} size="xl" />
        </Stat>
      </div>
      <p className="text-sm text-muted">Unrealised profit and loss needs live marks on open positions, which the exchange does not provide yet.</p>
      <Card title="Balance">
        <dl className="grid gap-3 sm:grid-cols-4">
          {[
            ['Trading balance', balance.available],
            ['Reserved for open orders', balance.reserved],
            ['Settled', balance.settled],
            ['Bank balance', balance.bank],
          ].map(([label, v]) => (
            <div key={label as string}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-0.5 text-lg font-semibold"><Num kind="money" value={v as number} size="lg" /></dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  )
}
