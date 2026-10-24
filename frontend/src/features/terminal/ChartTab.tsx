import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Bar, CandleTimeframe, Instrument, Market } from '../../api'
import { getAllCandles } from '../../api'
import { Banner, Button, Card, Num, SegmentedToggle, Spinner, Tooltip } from '../../components'
import { instrumentName } from '../../lib/instrumentDefaults'
import { cx } from '../../lib/cx'
import { barKey, useMarketStore } from '../../lib/marketStore'
import { instantToNaiveLocal } from '../../lib/marketClock'
import { marketTimezone } from '../../lib/marketTimezone'
import type { PriceFormat } from '../../lib/ticks'
import { advanceLive, historyWindow, liveBucketStart, liveToKLine, mergeFinal, TIMEFRAMES, toKLine, type LiveBar } from './bars'
import { addHoursNaive } from '../../lib/naive'
import { loadIndicatorPrefs, saveIndicatorPrefs, type ActiveIndicator } from './chartIndicatorPrefs'
import type { ChartType } from './chartTheme'
import { DepthPanel } from './DepthPanel'
import { TOOL_INFO } from './formationInfo'
import { IndicatorMenu } from './IndicatorMenu'
import { IndicatorSettings } from './IndicatorSettings'
import { PriceChart, type DrawTool, type PriceChartHandle } from './PriceChart'
import { SymbolSearch } from './SymbolSearch'
import { useSnapshot, useSubscriptions } from './hooks'

const TYPES = [
  { value: 'candles' as const, label: 'Candles' },
  { value: 'line' as const, label: 'Line' },
]

const ICON = 'h-5 w-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]'

type ToolId = DrawTool | 'cursor'

interface RailSingle {
  kind: 'single'
  id: ToolId
  label: string
  icon: ReactNode
}
interface RailGroup {
  kind: 'group'
  label: string
  icon: ReactNode
  items: Array<{ id: DrawTool; label: string }>
}
type RailItem = RailSingle | RailGroup

const CURSOR_HELP = 'Pick a drawing tool on the left, then click on the chart.'

const RAIL: RailItem[] = [
  { kind: 'single', id: 'cursor', label: 'Cursor', icon: <path d="M5 3l14 7-6 2-2 7z" /> },
  {
    kind: 'group',
    label: 'Lines',
    icon: <><path d="M5 18L19 6" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /></>,
    items: [
      { id: 'trend', label: 'Trend line' },
      { id: 'ray', label: 'Ray' },
      { id: 'horizontal', label: 'Horizontal line' },
      { id: 'horizontalRay', label: 'Horizontal ray' },
      { id: 'parallelChannel', label: 'Parallel channel' },
      { id: 'priceChannel', label: 'Price channel' },
    ],
  },
  { kind: 'single', id: 'fib', label: 'Fibonacci retracement', icon: <><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></> },
  {
    kind: 'group',
    label: 'Shapes',
    icon: <rect x="4" y="6" width="16" height="12" rx="1" />,
    items: [
      { id: 'rect', label: 'Rectangle' },
      { id: 'circle', label: 'Circle' },
      { id: 'polygon', label: 'Polygon' },
      { id: 'arc', label: 'Arc' },
    ],
  },
  {
    kind: 'group',
    label: 'Patterns',
    icon: <path d="M3 18l5-9 4 5 3-7 6 11z" />,
    items: [
      { id: 'headShoulders', label: 'Head & Shoulders' },
      { id: 'invHeadShoulders', label: 'Inverse Head & Shoulders' },
      { id: 'doubleTop', label: 'Double Top' },
      { id: 'doubleBottom', label: 'Double Bottom' },
      { id: 'triangleAsc', label: 'Triangle Ascending' },
      { id: 'triangleDesc', label: 'Triangle Descending' },
      { id: 'triangleSym', label: 'Triangle Symmetric' },
      { id: 'wedgeRising', label: 'Wedge Rising' },
      { id: 'wedgeFalling', label: 'Wedge Falling' },
      { id: 'flagBull', label: 'Flag Bullish' },
      { id: 'flagBear', label: 'Flag Bearish' },
      { id: 'cupHandle', label: 'Cup & Handle' },
      { id: 'harmonicXABCD', label: 'Harmonic (XABCD)' },
      { id: 'harmonicABCD', label: 'Harmonic (ABCD)' },
    ],
  },
  { kind: 'single', id: 'text', label: 'Text annotation', icon: <><path d="M5 6h14M12 6v12" /></> },
]

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

/** A rail icon that opens a flyout list of tools to its right (TradingView's grouped-icon pattern). */
function RailGroupButton({ group, current, onPick }: { group: RailGroup; current: ToolId; onPick: (id: DrawTool) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const pressed = group.items.some((i) => i.id === current)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={root} className="relative">
      <IconButton label={group.label} pressed={pressed} onClick={() => setOpen((o) => !o)}>
        {group.icon}
      </IconButton>
      {open && (
        <div role="menu" aria-label={group.label} className="absolute left-full top-0 z-30 ml-1 flex w-56 flex-col rounded-md border border-line bg-panel p-1 shadow-card">
          {group.items.map((item) => (
            <Tooltip key={item.id} text={TOOL_INFO[item.id]}>
              {(describedBy) => (
                <button
                  type="button"
                  role="menuitem"
                  aria-describedby={describedBy}
                  onClick={() => {
                    onPick(item.id)
                    setOpen(false)
                  }}
                  className={cx(
                    'flex min-h-[40px] w-full items-center rounded-sm px-3 text-left text-sm',
                    current === item.id ? 'bg-soft font-semibold text-ink' : 'text-ink hover:bg-raised',
                  )}
                >
                  {item.label}
                </button>
              )}
            </Tooltip>
          ))}
        </div>
      )}
    </div>
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
  /** Naive-local session_ends_at, set only while the active session is practice (on-demand).
   * An on-demand exchange runs on its OWN short clock (started whenever practice began, closes
   * at this instant) — nothing like the canonical market's 09:15-15:30 day. Falling back to the
   * canonical market's hours here would ask /v1/candles for a window the on-demand exchange
   * never traded in, so every small timeframe (whose lookback is "today" or a few days) comes
   * back empty, and only 60m's wide 20-day lookback happens to overlap at all. */
  practiceClosesAt?: string
}

/** How far before a practice session's close to start asking for candles — comfortably covers
 * warmup (2 min) plus the longest practice length (105 min) with margin, without needing to
 * know the on-demand exchange's exact start instant (not carried anywhere on the wire). */
const PRACTICE_LOOKBACK_HOURS = 3

/**
 * Chart = history, then live (Model A):
 *  - history: GET /v1/candles, finalized bars only, re-fetched on every (re)connect;
 *  - a `candle` frame arrives only when a bucket CLOSES and replaces the tip with the real bar;
 *  - between closes the rightmost bar's tip moves with snapshot.last_price.
 */
export function ChartTab({ market, instruments, fmtFor, symbol, onSymbol, timeframe, onTimeframe, practiceClosesAt }: ChartTabProps) {
  const [type, setType] = useState<ChartType>('candles')
  const [activeIndicators, setActiveIndicators] = useState<ActiveIndicator[]>([])
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  const [tool, setTool] = useState<ToolId>('cursor')
  const [undo, setUndo] = useState({ undo: 0, redo: 0 })
  const chart = useRef<PriceChartHandle>(null)

  // Restore indicators saved from a previous visit (browser-local, see chartIndicatorPrefs.ts).
  // Runs once: PriceChart's own mount effect (a child) has already set its chart ref by the
  // time this fires, since child effects run before the parent's.
  useEffect(() => {
    const saved = loadIndicatorPrefs()
    if (saved.length === 0) return
    saved.forEach((ind) => chart.current?.addIndicator(ind.name, ind.calcParams))
    setActiveIndicators(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  // unchanged by the contract rewrite). Practice (on-demand) overrides both ends with its own
  // short clock instead — see ChartTabProps.practiceClosesAt.
  const openAt = practiceClosesAt ? addHoursNaive(practiceClosesAt, -PRACTICE_LOOKBACK_HOURS) : instantToNaiveLocal(market.session.opens_at, tz)
  const closeAt = practiceClosesAt ?? instantToNaiveLocal(market.session.closes_at, tz)
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

  const selectTool = (t: ToolId) => {
    setTool(t)
    if (t === 'cursor') chart.current?.stopDraw()
    else chart.current?.startDraw(t)
  }

  const addIndicator = (name: string, calcParams?: number[]) => {
    chart.current?.addIndicator(name, calcParams)
    setActiveIndicators((prev) => {
      const next = prev.some((i) => i.name === name) ? prev : [...prev, { name, calcParams }]
      saveIndicatorPrefs(next)
      return next
    })
  }
  const removeIndicator = (name: string) => {
    chart.current?.removeIndicator(name)
    setActiveIndicators((prev) => {
      const next = prev.filter((i) => i.name !== name)
      saveIndicatorPrefs(next)
      return next
    })
  }
  const updateIndicator = (name: string, calcParams: number[]) => {
    chart.current?.addIndicator(name, calcParams) // addIndicator replaces an already-active name
    setActiveIndicators((prev) => {
      const next = prev.map((i) => (i.name === name ? { name, calcParams } : i))
      saveIndicatorPrefs(next)
      return next
    })
  }

  const instrument = instruments.find((i) => i.id === symbol)
  const loading = history.isFetching && !history.data
  const empty = !!history.data && history.data.length === 0 && !snap?.has_last
  const help = tool === 'cursor' ? CURSOR_HELP : TOOL_INFO[tool]

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
    <Card as="section" aria-label="Chart" flush className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line px-4 py-3">
        <SymbolSearch instruments={instruments} value={symbol} onChange={onSymbol} />
        <span className="text-2xl font-semibold">
          <Num kind="price" value={snap?.last_price ?? 0} fmt={fmt ?? { tick_size: 1, price_decimals: 0 }} available={!!snap && snap.has_last && !!fmt} size="xl" />
        </span>
        <span className="font-semibold">
          <Num kind="percent" value={snap?.change_pct ?? 0} available={!!snap && snap.has_last} />
        </span>
        <div className="flex-1" />
        <SegmentedToggle<CandleTimeframe> label="Timeframe" options={TIMEFRAMES.map((t) => ({ value: t, label: t }))} value={timeframe} onChange={onTimeframe} />
        <SegmentedToggle<ChartType> label="Chart type" options={TYPES} value={type} onChange={setType} />
        <IndicatorMenu active={activeIndicators.map((i) => i.name)} onAdd={addIndicator} onRemove={removeIndicator} />
        <IconButton label="Undo" disabled={undo.undo === 0} onClick={() => chart.current?.undo()}>
          <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>
        </IconButton>
        <IconButton label="Redo" disabled={undo.redo === 0} onClick={() => chart.current?.redo()}>
          <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>
        </IconButton>
      </div>

      {activeIndicators.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
          {activeIndicators.map(({ name, calcParams }) => (
            <span key={name} className="relative inline-flex items-center gap-0.5 rounded-pill border border-line bg-soft pl-2.5 text-xs font-semibold text-ink">
              {name}
              {calcParams && calcParams.length > 0 && (
                <button
                  type="button"
                  aria-label={`${name} settings`}
                  title="Settings"
                  onClick={() => setSettingsFor((cur) => (cur === name ? null : name))}
                  className="flex min-h-[28px] items-center px-1 text-muted hover:text-ink"
                >
                  ⚙
                </button>
              )}
              <button
                type="button"
                onClick={() => removeIndicator(name)}
                className="flex min-h-[28px] items-center px-1.5 pr-2.5 text-muted hover:text-ink"
              >
                <span aria-hidden="true">×</span>
                <span className="sr-only">Remove {name}</span>
              </button>
              {settingsFor === name && calcParams && (
                <IndicatorSettings
                  name={name}
                  calcParams={calcParams}
                  onApply={(next) => updateIndicator(name, next)}
                  onClose={() => setSettingsFor(null)}
                />
              )}
            </span>
          ))}
        </div>
      )}

      {history.isError && (
        <div className="p-3">
          <Banner tone="error" title="Could not load chart history" action={<Button variant="ghost" onClick={() => void history.refetch()}>Retry</Button>}>
            {history.error instanceof Error ? history.error.message : 'Something went wrong.'}
          </Banner>
        </div>
      )}

      <div className="flex min-h-[444px]">
        <div role="toolbar" aria-label="Drawing tools" className="flex w-14 flex-none flex-col items-center gap-1.5 border-r border-line py-2.5">
          {RAIL.map((item) =>
            item.kind === 'single' ? (
              <IconButton key={item.id} label={item.label} pressed={tool === item.id} onClick={() => selectTool(item.id)}>
                {item.icon}
              </IconButton>
            ) : (
              <RailGroupButton key={item.label} group={item} current={tool} onPick={selectTool} />
            ),
          )}
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
          {symbol}{instrument ? ` · ${instrumentName(instrument)}` : ''}, {timeframe}, {type === 'candles' ? 'candles' : 'line'}. {help}
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
