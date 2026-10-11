import type { SnapshotData } from '@contract/ws'
import { Num } from '../../components'
import type { PriceFormat } from '../../lib/ticks'

const ROWS = 5 // the board shows five levels a side (the wire carries up to ten)

function Bar({ pct, side }: { pct: number; side: 'bid' | 'ask' }) {
  return <span aria-hidden="true" className={`absolute inset-y-0 left-0 z-0 ${side === 'bid' ? 'bg-gainBg' : 'bg-lossBg'}`} style={{ width: `${pct}%` }} />
}

/**
 * Market depth from `snapshot.data` — the board's two columns: bids (qty | price) and asks
 * (price | qty), depth bars scaled to the largest level shown, totals underneath. Every
 * number is gated on its has_* flag: has_bid:false is NOT a bid of 0.
 */
export function DepthPanel({ symbol, snap, fmt, embedded = false }: { symbol: string; snap: SnapshotData | undefined; fmt: PriceFormat | null; embedded?: boolean }) {
  const bids = snap && snap.quote.has_bid ? snap.depth.bids.slice(0, ROWS) : []
  const asks = snap && snap.quote.has_ask ? snap.depth.asks.slice(0, ROWS) : []
  const max = Math.max(1, ...bids.map((l) => l.qty), ...asks.map((l) => l.qty))
  const spread = snap && snap.quote.has_bid && snap.quote.has_ask ? snap.quote.best_ask - snap.quote.best_bid : null
  const sum = (ls: Array<{ qty: number }>) => ls.reduce((n, l) => n + l.qty, 0)
  const f = fmt ?? { tick_size: 1, price_decimals: 0 }

  return (
    <div className={embedded ? 'flex flex-col gap-3 px-4 pb-4 pt-3.5' : 'flex flex-col gap-3 border-t border-line bg-raised px-4 pb-4 pt-3.5'} role="group" aria-label={`Market depth, ${symbol}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-[0.9375rem] font-semibold">Market depth, {symbol}</h3>
        <span className="text-sm text-muted">
          Spread <Num kind="price" value={spread ?? 0} fmt={f} available={spread !== null && fmt !== null} size="sm" />
        </span>
        {snap && !snap.quote.has_bid && !snap.quote.has_ask && (
          <span className="text-sm text-muted">No book while the market is {snap.phase === 'preopen' ? 'in pre-open' : snap.phase}.</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section aria-label="Bids">
          <div className="flex justify-between gap-3 px-2.5 py-1.5 text-xs font-semibold text-muted"><span>Bid qty</span><span>Bid price</span></div>
          {bids.length === 0 ? (
            <p className="px-2.5 py-1.5 text-sm text-muted">No bids</p>
          ) : (
            bids.map((l) => (
              <div key={l.price} className="relative flex justify-between gap-3 overflow-hidden rounded-[6px] px-2.5 py-1.5 text-sm">
                <Bar pct={(l.qty / max) * 100} side="bid" />
                <span className="relative z-[1]"><Num kind="qty" value={l.qty} /></span>
                <span className="relative z-[1]"><Num kind="price" value={l.price} fmt={f} available={fmt !== null} className="font-semibold !text-gain" /></span>
              </div>
            ))
          )}
        </section>
        <section aria-label="Asks">
          <div className="flex justify-between gap-3 px-2.5 py-1.5 text-xs font-semibold text-muted"><span>Ask price</span><span>Ask qty</span></div>
          {asks.length === 0 ? (
            <p className="px-2.5 py-1.5 text-sm text-muted">No asks</p>
          ) : (
            asks.map((l) => (
              <div key={l.price} className="relative flex justify-between gap-3 overflow-hidden rounded-[6px] px-2.5 py-1.5 text-sm">
                <Bar pct={(l.qty / max) * 100} side="ask" />
                <span className="relative z-[1]"><Num kind="price" value={l.price} fmt={f} available={fmt !== null} className="font-semibold !text-loss" /></span>
                <span className="relative z-[1]"><Num kind="qty" value={l.qty} /></span>
              </div>
            ))
          )}
        </section>
      </div>

      <div className="flex justify-between gap-3 border-t border-line px-2.5 pt-2 text-sm text-muted">
        <span>Total bid <Num kind="qty" value={sum(bids)} size="sm" available={bids.length > 0} /></span>
        <span>Total ask <Num kind="qty" value={sum(asks)} size="sm" available={asks.length > 0} /></span>
      </div>
    </div>
  )
}
