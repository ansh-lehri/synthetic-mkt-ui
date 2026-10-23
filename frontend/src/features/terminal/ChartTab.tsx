import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Bar, CandleTimeframe, Instrument, Market } from '../../api'
import { getAllCandles } from '../../api'
import { Banner, Button, Card, Chip, Num, SegmentedToggle, Spinner } from '../../components'
import { instrumentName } from '../../lib/instrumentDefaults'
import { barKey, useMarketStore } from '../../lib/marketStore'
import { instantToNaiveLocal } from '../../lib/marketClock'
import { marketTimezone } from '../../lib/marketTimezone'
import type { PriceFormat } from '../../lib/ticks'
import { advanceLive, historyWindow, liveBucketStart, liveToKLine, mergeFinal, TIMEFRAMES, toKLine, type LiveBar } from './bars'
import type { ChartType } from './chartTheme'
import { DepthPanel } from './DepthPanel'
import { PriceChart, type DrawTool, type PriceChartHandle } from './PriceChart'
import { useSnapshot, useSubscriptions } from './hooks'

const TYPES = [
  { value: 'candles' as const, label: 'Candles' },
  { value: 'line' as const, label: 'Line' },
]

const ICON = 'h-5 w-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]'

const TOOLS: Array<{ id: DrawTool | 'cursor'; label: string; icon: React.ReactNode }> = [
  { id: 'cursor', label: 'Cursor', icon: <path d="M5 3l14 7-6 2-2 7z" /> },
  { id: 'trend', label: 'Trend line', icon: (<><path d="M5 18L19 6" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /></>) },
  { id: 'horizontal', label: 'Horizontal line', icon: (<><path d="M3 12h18" /><circle cx="12" cy="12" r="2" /></>) },
  { id: 'rect', label: 'Rectangle', icon: <rect x="4" y="6" width="16" height="12" rx="1" /> },
]

const HELP: Record<string, string> = {
  cursor: 'Pick a drawing tool on the left, then click on the chart.',
  trend: 'Click twice on the chart to draw a trend line.',
  horizontal: 'Click once on the chart to place a horizontal line.',
  rect: 'Click twice on the chart to draw a rectangle.',
}

function IconButton({ label, disabled, pressed, onClick, children, className = '' }: { label: string; disabled?: boolean; pressed?: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-md text-muted enabled:hover:bg-raised enabled:hover:text-ink disabled:opacity-40 ${pressed ? '!bg-soft !text-accent shadow-[inset_0_0_0_1px_var(--accent)]' : ''} ${className}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={ICON}>{children}</svg>
    </button>
  )
}

export interface ChartTabProps {
  market: Market
  instruments: Instrument[]
  fmtFor: (symbol: string) => PriceFormat | null
  symbol: string
  onSymbol: (s: string) => void
  timeframe: CandleTimeframe
  onTimeframe: (t: CandleTimeframe) => void
}

/**
 * Chart = history, then live (Model A):
 *  - history: GET /v1/candles, finalized bars only, re-fetched on every (re)connect;
 *  - a `candle` frame arrives only when a bucket CLOSES and replaces the tip with the real bar;
 *  - between closes the rightmost bar's tip moves with snapshot.last_price.
 */
export function ChartTab({ market, instruments, fmtFor, symbol, onSymbol, timeframe, onTimeframe }: ChartTabProps) {
  const [type, setType] = useState<ChartType>('candles')
  const [ma, setMa] = useState(false)
  const [tool, setTool] = useState<DrawTool | 'cursor'>('cursor')
  const [undo, setUndo] = useState({ undo: 0, redo: 0 })
  const chart = useRef<PriceChartHandle>(null)

  const epoch = useMarketStore((s) => s.epoch)
  const status = useMarketStore((s) => s.status)
  const snap = useSnapshot(symbol)
  const pushed = useMarketStore((s) => s.bars[barKey(symbol, timeframe)])

  useSubscriptions([
    { stream: 'snapshot', instrument: symbol },
    { stream: 'candle', instrument: symbol, timeframe },
  ])

  const tz = marketTimezone(market.tag)
  // GET /v1/markets' session.opens_at/closes_at are now real RFC3339 instants — converted
  // to the naive-local strings GET /v1/candles still expects (that endpoint's convention is
  // unchanged by the contract rewrite).
  const openAt = instantToNaiveLocal(market.session.opens_at, tz)
  const closeAt = instantToNaiveLocal(market.session.closes_at, tz)
  const fmt = fmtFor(symbol)

  // History. The query key carries the socket epoch, so a reconnect RE-FETCHES it (the server
  // does no backfill). It waits for the first connect (or a failed one) to avoid loading twice.
  const history = useQuery({
    queryKey: ['candles', market.tag, symbol, timeframe, openAt, epoch],
    queryFn: () => getAllCandles({ market: market.tag, instrument: symbol, timeframe, ...historyWindow(timeframe, openAt, closeAt) }),
    enabled: epoch > 0 || status === 'reconnecting',
    gcTime: 0,
    staleTime: 0,
    retry: 1,
  })

  const finals = useRef<Bar[]>([])
  const live = useRef<LiveBar | null>(null)

  const pushTip = () => {
    if (!snap || !snap.has_last || (snap.phase !== 'open' && snap.phase !== 'auction')) return
    const last = finals.current[finals.current.length - 1] ?? null
    const start = liveBucketStart(last, openAt)
    if (!start) return
    live.current = advanceLive(live.current, start, last, snap.last_price)
    chart.current?.update(liveToKLine(live.current))
  }
  const pushTipRef = useRef(pushTip)
  pushTipRef.current = pushTip

  const applyFinal = (b: Bar) => {
    const before = finals.current
    const after = mergeFinal(before, b)
    if (after === before) return // already in history
    finals.current = after
    live.current = null // the closed bar replaces the tip
    chart.current?.update(toKLine(b))
  }

  // 1. History arrived (first load or after a reconnect): replace everything, then catch up
  //    on any bar that closed while it was loading.
  useEffect(() => {
    if (!history.data) return
    finals.current = history.data
    live.current = null
    chart.current?.reset(history.data.map(toKLine))
    if (pushed) applyFinal(pushed.bar)
    pushTipRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.data])

  // 2. A bucket closed.
  useEffect(() => {
    if (pushed && history.data) {
      applyFinal(pushed.bar)
      pushTipRef.current()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushed?.seq])

  // 3. Price moved between bars: extend the rightmost bar's tip.
  useEffect(() => {
    if (history.data) pushTip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap])

  // New instrument / timeframe: forget the old series immediately.
  useEffect(() => {
    finals.current = []
    live.current = null
    setTool('cursor')
    setUndo({ undo: 0, redo: 0 })
  }, [symbol, timeframe])

  const selectTool = (t: DrawTool | 'cursor') => {
    setTool(t)
    if (t === 'cursor') chart.current?.stopDraw()
    else chart.current?.startDraw(t)
  }

  const instrument = instruments.find((i) => i.id === symbol)
  const loading = history.isFetching && !history.data
  const empty = !!history.data && history.data.length === 0 && !snap?.has_last

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
    <Card as="section" aria-label="Chart" flush className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line px-4 py-3">
        <label className="sr-only" htmlFor="ch-sym">Instrument</label>
        <select
          id="ch-sym"
          value={symbol}
          onChange={(e) => onSymbol(e.target.value)}
          className="min-h-[44px] rounded-md border border-line bg-raised px-3 text-sm text-ink"
        >
          {instruments.map((i) => (
            <option key={i.id} value={i.id}>{i.id}  {instrumentName(i)}</option>
          ))}
        </select>
        <span className="text-2xl font-semibold">
          <Num kind="price" value={snap?.last_price ?? 0} fmt={fmt ?? { tick_size: 1, price_decimals: 0 }} available={!!snap && snap.has_last && !!fmt} size="xl" />
        </span>
        <span className="font-semibold">
          <Num kind="percent" value={snap?.change_pct ?? 0} available={!!snap && snap.has_last} />
        </span>
        <div className="flex-1" />
        <SegmentedToggle<CandleTimeframe> label="Timeframe" options={TIMEFRAMES.map((t) => ({ value: t, label: t }))} value={timeframe} onChange={onTimeframe} />
        <SegmentedToggle<ChartType> label="Chart type" options={TYPES} value={type} onChange={setType} />
        <Chip selected={ma} onClick={() => setMa((v) => !v)}>MA 20</Chip>
        <IconButton label="Undo" disabled={undo.undo === 0} onClick={() => chart.current?.undo()}>
          <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>
        </IconButton>
        <IconButton label="Redo" disabled={undo.redo === 0} onClick={() => chart.current?.redo()}>
          <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>
        </IconButton>
      </div>

      {history.isError && (
        <div className="p-3">
          <Banner tone="error" title="Could not load chart history" action={<Button variant="ghost" onClick={() => void history.refetch()}>Retry</Button>}>
            {history.error instanceof Error ? history.error.message : 'Something went wrong.'}
          </Banner>
        </div>
      )}

      <div className="flex min-h-[444px]">
        <div role="toolbar" aria-label="Drawing tools" className="flex w-14 flex-none flex-col items-center gap-1.5 border-r border-line py-2.5">
          {TOOLS.map((t) => (
            <IconButton key={t.id} label={t.label} pressed={tool === t.id} onClick={() => selectTool(t.id)}>{t.icon}</IconButton>
          ))}
          <span className="my-1 h-px w-7 bg-line" aria-hidden="true" />
          <IconButton label="Remove all drawings" disabled={undo.undo === 0 && undo.redo === 0} onClick={() => { chart.current?.clearDrawings(); setTool('cursor') }}>
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          </IconButton>
        </div>
        <div className="relative my-3 min-w-0 flex-1">
          <PriceChart
            ref={chart}
            symbol={symbol}
            timeframe={timeframe}
            fmt={fmt ?? { tick_size: 1, price_decimals: 0 }}
            type={type}
            ma={ma}
            onDrawingsChange={(u, r) => setUndo({ undo: u, redo: r })}
            className="h-[420px] w-full lg:h-[calc(100vh-20rem)] lg:min-h-[420px]"
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-panel/60" role="status">
              <Spinner label="Loading chart history" />
            </div>
          )}
          {empty && !loading && (
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted">No bars yet — the market has not opened.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line px-4 py-2.5 text-sm text-muted">
        <span>
          {symbol}{instrument ? ` · ${instrumentName(instrument)}` : ''}, {timeframe}, {type === 'candles' ? 'candles' : 'line'}
          {ma ? ', MA 20 on' : ''}. {HELP[tool]}
        </span>
      </div>
    </Card>

    {/* Right column: the live book beside the chart. The order ticket (next slice) joins it here. */}
    <div className="flex min-w-0 flex-col gap-4">
      <Card as="section" aria-label="Order book" flush className="overflow-hidden">
        <DepthPanel symbol={symbol} snap={snap} fmt={fmt} embedded />
      </Card>
    </div>
    </div>
  )
}
