import { cx } from '../lib/cx'
import type { PriceFormat } from '../lib/ticks'
import { Num } from './Num'

export interface DepthLevel {
  price: number
  qty: number
}

export interface DepthLadderProps {
  fmt: PriceFormat
  /** Best-first, as on the wire (`snapshot.data.depth`). */
  bids: DepthLevel[]
  asks: DepthLevel[]
  /** `quote.has_bid` / `has_ask` / `has_last` — 0 is a valid price, so absence is explicit. */
  hasBid: boolean
  hasAsk: boolean
  lastPrice?: number
  hasLast?: boolean
  /** Levels per side. Default 5 (wire carries up to 10). */
  rows?: number
  className?: string
}

function Row({ level, side, fmt, max }: { level: DepthLevel | undefined; side: 'bid' | 'ask'; fmt: PriceFormat; max: number }) {
  if (!level) {
    return (
      <tr className="h-7 text-muted">
        <td className="px-3 text-xs">{side === 'bid' ? 'No bid' : 'No ask'}</td>
        <td className="px-3 text-right">—</td>
        <td className="px-3 text-right">—</td>
      </tr>
    )
  }
  const pct = max > 0 ? Math.max(2, Math.round((level.qty / max) * 100)) : 0
  return (
    <tr
      className="h-7"
      // Depth bar spans the whole row; width is data, colour is a token.
      style={{
        backgroundImage: `linear-gradient(to left, var(${side === 'bid' ? '--gainBg' : '--lossBg'}) ${pct}%, transparent ${pct}%)`,
      }}
    >
      <td className="px-3 text-right">
        <span className="sr-only">{side === 'bid' ? 'Bid ' : 'Ask '}</span>
        <Num kind="price" value={level.price} fmt={fmt} className={side === 'bid' ? '!text-gain' : '!text-loss'} />
      </td>
      <td className="px-3 text-right">
        <Num kind="qty" value={level.qty} />
      </td>
      <td className="px-3 text-right text-muted">
        <span className="text-xs">{side === 'bid' ? 'BID' : 'ASK'}</span>
      </td>
    </tr>
  )
}

/**
 * Bid/ask ladder from the WS snapshot depth. Asks above (best nearest the middle), last
 * price + spread in the centre, bids below. Side is told by position AND an explicit
 * BID/ASK label — colour is a reinforcement, never the only cue. Gated on has_* flags.
 */
export function DepthLadder({ fmt, bids, asks, hasBid, hasAsk, lastPrice, hasLast = false, rows = 5, className }: DepthLadderProps) {
  const shownBids = hasBid ? bids.slice(0, rows) : []
  const shownAsks = hasAsk ? asks.slice(0, rows) : []
  const max = Math.max(0, ...shownBids.map((l) => l.qty), ...shownAsks.map((l) => l.qty))

  // Asks render highest → lowest so the best ask touches the centre row; pad missing levels.
  const askRows = Array.from({ length: rows }, (_, i) => shownAsks[rows - 1 - i])
  const bidRows = Array.from({ length: rows }, (_, i) => shownBids[i])

  const spread = hasBid && hasAsk && bids[0] && asks[0] ? asks[0].price - bids[0].price : null

  return (
    <table className={cx('w-full border-collapse text-sm', className)}>
      <caption className="sr-only">Order book depth</caption>
      <thead>
        <tr className="border-b border-line text-xs text-muted">
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Price
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Qty
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Side
          </th>
        </tr>
      </thead>
      <tbody>
        {askRows.map((l, i) => (
          <Row key={`a${i}`} level={l} side="ask" fmt={fmt} max={max} />
        ))}
        <tr className="border-y border-line bg-raised">
          <td className="px-3 py-2 text-right" colSpan={2}>
            <span className="mr-2 text-xs text-muted">Last</span>
            <Num kind="price" value={lastPrice ?? 0} fmt={fmt} available={hasLast && lastPrice !== undefined} size="lg" className="font-semibold" />
          </td>
          <td className="px-3 py-2 text-right text-xs text-muted">
            <span>Spread </span>
            <Num kind="price" value={spread ?? 0} fmt={fmt} available={spread !== null} size="sm" />
          </td>
        </tr>
        {bidRows.map((l, i) => (
          <Row key={`b${i}`} level={l} side="bid" fmt={fmt} max={max} />
        ))}
      </tbody>
    </table>
  )
}
