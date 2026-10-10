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

export type DrawTool = 'trend' | 'horizontal' | 'rect'

const OVERLAY_NAME: Record<DrawTool, string> = { trend: 'segment', horizontal: 'horizontalStraightLine', rect: 'rectBox' }

// The library has no rectangle overlay; this two-point one draws a box.
let registered = false
function registerOnce() {
  if (registered) return
  registered = true
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
}

export interface PriceChartProps {
  symbol: string
  timeframe: CandleTimeframe
  fmt: PriceFormat
  type: ChartType
  ma: boolean
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
  const { symbol, timeframe, fmt, type, ma, onDrawingsChange, className } = props
  const host = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const dataRef = useRef<KLineData[]>([])
  const pushRef = useRef<((bar: KLineData) => void) | null>(null)
  const drawn = useRef<Drawn[]>([])
  const undone = useRef<Drawn[]>([])
  const tool = useRef<DrawTool | null>(null)
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

  // MA 20 on the price pane.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.removeIndicator({ name: 'MA' })
    if (ma) chart.createIndicator({ name: 'MA', calcParams: [20], paneId: 'candle_pane' }, true)
  }, [ma])

  return <div ref={host} className={className} data-testid="price-chart" />
})
