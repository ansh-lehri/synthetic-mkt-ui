// KLineCharts wrapper. The library is imperative, so this component owns the chart instance
// in a ref and exposes a small imperative handle; React state stays outside the canvas.
//
// Prices are raw int64 all the way into the chart (precision 0); every price LABEL — axis,
// crosshair, last-price mark — goes through the tick formatter via the library's
// thousandsSeparator hook, so scaling lives in exactly one place (lib/ticks.ts).
import {
  dispose,
  init,
  registerOverlay,
  type Chart,
  type KLineData,
  type Period,
} from 'klinecharts'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { formatPrice, type PriceFormat } from '../../lib/ticks'
import { readChartTheme, type ChartType } from './chartTheme'
import { TIMEFRAME_MINUTES } from './bars'
import type { CandleTimeframe } from '../../api'
import { registerChartPatterns } from './chartOverlayPatterns'
import { registerCustomIndicators } from './chartCustomIndicators'

export type DrawTool =
  | 'trend'
  | 'ray'
  | 'horizontal'
  | 'horizontalRay'
  | 'parallelChannel'
  | 'priceChannel'
  | 'fib'
  | 'rect'
  | 'circle'
  | 'polygon'
  | 'arc'
  | 'text'
  | 'headShoulders'
  | 'invHeadShoulders'
  | 'doubleTop'
  | 'doubleBottom'
  | 'triangleAsc'
  | 'triangleDesc'
  | 'triangleSym'
  | 'wedgeRising'
  | 'wedgeFalling'
  | 'flagBull'
  | 'flagBear'
  | 'cupHandle'
  | 'harmonicXABCD'
  | 'harmonicABCD'

const OVERLAY_NAME: Record<DrawTool, string> = {
  trend: 'segment',
  ray: 'rayLine',
  horizontal: 'horizontalStraightLine',
  horizontalRay: 'horizontalRayLine',
  parallelChannel: 'parallelStraightLine',
  priceChannel: 'priceChannelLine',
  fib: 'fibonacciLineStyled',
  rect: 'rectBox',
  circle: 'circle',
  polygon: 'polygon',
  arc: 'arc',
  text: 'text',
  headShoulders: 'HeadAndShoulders',
  invHeadShoulders: 'InverseHeadAndShoulders',
  doubleTop: 'DoubleTop',
  doubleBottom: 'DoubleBottom',
  triangleAsc: 'TriangleAscending',
  triangleDesc: 'TriangleDescending',
  triangleSym: 'TriangleSymmetric',
  wedgeRising: 'WedgeRising',
  wedgeFalling: 'WedgeFalling',
  flagBull: 'FlagBull',
  flagBear: 'FlagBear',
  cupHandle: 'CupAndHandle',
  harmonicXABCD: 'XABCD',
  harmonicABCD: 'ABCD',
}

// Indicators placed on the price scale itself (candle_pane); everything else gets its own
// sub-pane (an oscillator). Mirrors the reference charting project's own split.
export const MAIN_PANE_INDICATORS = new Set(['MA', 'EMA', 'SMA', 'BBI', 'BOLL', 'SAR'])

// Fixed cycling palette so simultaneously-active indicator lines stay visually distinct.
// Deliberately not design tokens (see chartOverlayPatterns.ts's comment) — these are
// user-added analysis lines, not chrome, and tokens.css has no 8-way indicator palette.
const INDICATOR_COLORS = ['#a78bfa', '#38bdf8', '#fb923c', '#34d399', '#f472b6', '#facc15', '#60a5fa', '#f87171']

// The library has no rectangle overlay; this two-point one draws a box. Chart-pattern
// overlays and the two custom indicators (Aroon, A/D) register themselves on import.
let registered = false
function registerOnce() {
  if (registered) return
  registered = true
  registerChartPatterns()
  registerCustomIndicators()
  registerOverlay({
    name: 'rectBox',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return []
      const [a, b] = coordinates
      return [{ type: 'rect', attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }, styles: { style: 'stroke_fill' } }]
    },
  })
}

export interface PriceChartHandle {
  /** Replace all bars (history). */
  reset: (bars: KLineData[]) => void
  /** Add a bar, or update the rightmost one in place when the timestamp matches. */
  update: (bar: KLineData) => void
  startDraw: (tool: DrawTool) => void
  stopDraw: () => void
  undo: () => void
  redo: () => void
  clearDrawings: () => void
  /** Add an indicator by its KLineCharts name (built-in or custom-registered). Each name is a
   * singleton: adding one already active replaces it with the new calcParams. */
  addIndicator: (name: string, calcParams?: number[]) => void
  removeIndicator: (name: string) => void
  activeIndicators: () => string[]
}

export interface PriceChartProps {
  symbol: string
  timeframe: CandleTimeframe
  fmt: PriceFormat
  type: ChartType
  /** Reports how many drawings can be undone / redone. */
  onDrawingsChange?: (undo: number, redo: number) => void
  className?: string
}

interface Drawn {
  id: string
  name: string
  points: Array<{ timestamp?: number; value?: number }>
}

function periodOf(tf: CandleTimeframe): Period {
  return { type: 'minute', span: TIMEFRAME_MINUTES[tf] }
}

export const PriceChart = forwardRef<PriceChartHandle, PriceChartProps>(function PriceChart(props, ref) {
  const { symbol, timeframe, fmt, type, onDrawingsChange, className } = props
  const host = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const dataRef = useRef<KLineData[]>([])
  const pushRef = useRef<((bar: KLineData) => void) | null>(null)
  const drawn = useRef<Drawn[]>([])
  const undone = useRef<Drawn[]>([])
  const tool = useRef<DrawTool | null>(null)
  const indicators = useRef<Map<string, { paneId: string; isMainPane: boolean }>>(new Map())
  const colorCount = useRef(0)
  const typeRef = useRef(type)
  typeRef.current = type
  const onChange = useRef(onDrawingsChange)
  onChange.current = onDrawingsChange

  const report = () => onChange.current?.(drawn.current.length, undone.current.length)

  const startDraw = (t: DrawTool) => {
    const chart = chartRef.current
    if (!chart) return
    tool.current = t
    chart.createOverlay({
      name: OVERLAY_NAME[t],
      onDrawEnd: ({ overlay }) => {
        drawn.current.push({ id: overlay.id, name: overlay.name, points: overlay.points.map((p) => ({ timestamp: p.timestamp, value: p.value })) })
        undone.current = []
        report()
        if (tool.current === t) startDraw(t) // the tool stays active, as on the board
        return true
      },
    })
  }

  useImperativeHandle(ref, () => ({
    reset: (bars) => {
      dataRef.current = bars
      chartRef.current?.resetData()
    },
    update: (bar) => pushRef.current?.(bar),
    startDraw,
    stopDraw: () => {
      tool.current = null
      // Cancel a half-drawn overlay by removing any that never completed.
      chartRef.current?.getOverlays().forEach((o) => {
        if (!drawn.current.some((d) => d.id === o.id)) chartRef.current?.removeOverlay({ id: o.id })
      })
    },
    undo: () => {
      const last = drawn.current.pop()
      if (!last) return
      chartRef.current?.removeOverlay({ id: last.id })
      undone.current.push(last)
      report()
    },
    redo: () => {
      const next = undone.current.pop()
      const chart = chartRef.current
      if (!next || !chart) return
      const id = chart.createOverlay({ name: next.name, points: next.points }) as string | null
      if (id) drawn.current.push({ ...next, id })
      report()
    },
    clearDrawings: () => {
      chartRef.current?.removeOverlay()
      drawn.current = []
      undone.current = []
      tool.current = null
      report()
    },
    addIndicator: (name, calcParams) => {
      const chart = chartRef.current
      if (!chart) return
      const isMainPane = MAIN_PANE_INDICATORS.has(name)
      const existing = indicators.current.get(name)
      if (existing) chart.removeIndicator({ paneId: existing.paneId, name })
      const color = INDICATOR_COLORS[colorCount.current % INDICATOR_COLORS.length]
      colorCount.current += 1
      const paneId = chart.createIndicator(
        {
          name,
          paneId: isMainPane ? 'candle_pane' : `pane_${name}`,
          ...(calcParams ? { calcParams } : {}),
          styles: { lines: [{ color }, { color, style: 'dashed', dashedValue: [4, 3] }, { color }, { color }] },
        },
        isMainPane,
      ) as string | null
      indicators.current.set(name, { paneId: isMainPane ? 'candle_pane' : (paneId ?? `pane_${name}`), isMainPane })
    },
    removeIndicator: (name) => {
      const chart = chartRef.current
      const existing = indicators.current.get(name)
      if (!chart || !existing) return
      chart.removeIndicator({ paneId: existing.paneId, name })
      indicators.current.delete(name)
    },
    activeIndicators: () => Array.from(indicators.current.keys()),
  }))

  // Create / dispose the chart once.
  useEffect(() => {
    registerOnce()
    const el = host.current
    if (!el) return
    const chart = init(el, { timezone: 'UTC', locale: 'en-US', styles: readChartTheme(el, typeRef.current) })
    if (!chart) return
    chartRef.current = chart
    chart.setDataLoader({
      getBars: ({ type: kind, callback }) => {
        if (kind === 'init') callback(dataRef.current, false)
        else callback([], false)
      },
      subscribeBar: ({ callback }) => {
        pushRef.current = callback
      },
      unsubscribeBar: () => {
        pushRef.current = null
      },
    })
    chart.setDecimalFold({ format: (v) => String(v) })

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    // Re-colour when the theme flips (data-theme on <html>).
    const mo = new MutationObserver(() => chart.setStyles(readChartTheme(el, typeRef.current)))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      ro.disconnect()
      mo.disconnect()
      pushRef.current = null
      chartRef.current = null
      dispose(el)
    }
  }, [])

  // Instrument / timeframe: the chart reloads and drawings are dropped (as on the board).
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.removeOverlay()
    drawn.current = []
    undone.current = []
    tool.current = null
    report()
    dataRef.current = []
    chart.setSymbol({ ticker: symbol, pricePrecision: 0, volumePrecision: 0 })
    chart.setPeriod(periodOf(timeframe))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe])

  // Every price label goes through the tick formatter.
  useEffect(() => {
    chartRef.current?.setThousandsSeparator({ format: (v) => formatPrice(Math.round(Number(v)), fmt) })
  }, [fmt])

  // Candles <-> line.
  useEffect(() => {
    const el = host.current
    if (el) chartRef.current?.setStyles(readChartTheme(el, type))
  }, [type])

  return <div ref={host} className={className} data-testid="price-chart" />
})
