import { useState } from 'react'
import type { Position } from '../../api'
import { Banner, Button, Card, Num, SkeletonText } from '../../components'
import { instrumentName } from '../../lib/instrumentDefaults'
import { useMarketStore } from '../../lib/marketStore'
import type { Side } from '../../lib/orderTicket'
import { DepthPanel } from './DepthPanel'
import type { InstrumentBook } from './hooks'

/**
 * The Market tab: the instrument list (watchlist) with live last price and change from the
 * snapshot stream. Selecting a row reveals Depth and Chart; depth expands inline, as on the
 * board, and Buy / Sell open the order window.
 */
export function MarketTab({
  book,
  holdings,
  onTrade,
  onOpenChart,
}: {
  book: InstrumentBook
  /** Open positions (from the observation poll) — fills the Held column. */
  holdings?: Position[]
  /** Open the order window; undefined = ordering unavailable (no live session). */
  onTrade?: (side: Side, symbol: string) => void
  onOpenChart: (symbol: string) => void
}) {
  const snapshots = useMarketStore((s) => s.snapshots)
  const [selected, setSelected] = useState<string | null>(null)
  const [depthFor, setDepthFor] = useState<string | null>(null)

  if (book.error)
    return (
      <Banner tone="error" title="Could not load instruments" action={<Button variant="ghost" onClick={book.refetch}>Retry</Button>}>
        {book.error instanceof Error ? book.error.message : 'Something went wrong.'}
      </Banner>
    )
  if (book.isPending) return <Card><SkeletonText lines={3} label="Loading instruments" /></Card>

  return (
    <Card as="section" aria-label="Instruments" flush className="overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(4.5rem,1fr))] items-center gap-3 bg-panel px-4 py-2.5 text-xs font-semibold text-muted">
        <span>Instrument</span>
        <span className="text-right">Last</span>
        <span className="text-right">Change</span>
        <span className="text-right">Held</span>
      </div>
      {book.instruments.map((i) => {
        const snap = snapshots[i.id]
        const fmt = book.fmtFor(i.id)
        const on = selected === i.id
        return (
          <div key={i.id} className="border-t border-line">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => {
                setSelected(on ? null : i.id)
                if (on) setDepthFor(null)
                else if (depthFor && depthFor !== i.id) setDepthFor(null)
              }}
              className={`grid min-h-[60px] w-full grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(4.5rem,1fr))] items-center gap-3 px-4 py-1.5 text-left hover:bg-raised ${on ? 'bg-raised' : ''}`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[0.9375rem] font-semibold">{i.id}</span>
                <span className="truncate text-sm text-muted">{instrumentName(i)}</span>
              </span>
              <span className="text-right font-semibold">
                <Num kind="price" value={snap?.last_price ?? 0} fmt={fmt ?? { tick_size: 1, price_decimals: 0 }} available={!!snap && snap.has_last && fmt !== null} />
              </span>
              <span className="text-right">
                <Num kind="percent" value={snap?.change_pct ?? 0} available={!!snap && snap.has_last} />
              </span>
              <span className="text-right">
                <HeldQty qty={holdings?.find((p) => p.instrument === i.id)?.qty ?? 0} known={!!holdings} />
              </span>
            </button>
            {on && (
              <div className="flex flex-wrap gap-2 bg-raised px-4 pb-3.5 pt-1">
                <Button variant="buy" disabled={!onTrade} onClick={() => onTrade?.('buy', i.id)}>Buy</Button>
                <Button variant="sell" disabled={!onTrade} onClick={() => onTrade?.('sell', i.id)}>Sell</Button>
                <Button variant="ghost" onClick={() => setDepthFor(depthFor === i.id ? null : i.id)}>
                  {depthFor === i.id ? 'Hide depth' : 'Depth'}
                </Button>
                <Button variant="ghost" onClick={() => onOpenChart(i.id)}>Chart</Button>
              </div>
            )}
            {on && depthFor === i.id && <DepthPanel symbol={i.id} snap={snap} fmt={fmt} />}
          </div>
        )
      })}
    </Card>
  )
}

function HeldQty({ qty, known }: { qty: number; known: boolean }) {
  // "–" for none, as on the board; "—" (unavailable) until the first account read lands.
  if (!known) return <Num kind="qty" value={0} available={false} />
  return qty === 0 ? <span className="text-muted">–</span> : <Num kind="qty" value={qty} />
}
