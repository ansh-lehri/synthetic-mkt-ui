// Chart-pattern drawing tools: hand-drawn overlay shapes for the Patterns flyout in
// ChartTab's left rail. Ported verbatim (geometry unchanged) from the reference
// charting project's registerOverlay calls — see BACKEND-INTEGRATION-PLAN.md-adjacent
// plan notes. Colors here are the reference's own fixed palette (not design tokens):
// these are drawing annotations the user places, not chrome, so they don't need to
// follow Night/Lab theme tokens the way the candle/grid/axis colors in chartTheme.ts do.
import { registerOverlay } from 'klinecharts'

let registered = false

// TradingView-style Fibonacci levels: ratio, fill color, line color, label.
const FIB_LEVELS = [
  { ratio: 0, fill: 'rgba(156,39,176,0.06)', line: 'rgba(156,39,176,0.7)', label: '0' },
  { ratio: 0.236, fill: 'rgba(33,150,243,0.06)', line: 'rgba(33,150,243,0.7)', label: '0.236' },
  { ratio: 0.382, fill: 'rgba(0,188,212,0.06)', line: 'rgba(0,188,212,0.7)', label: '0.382' },
  { ratio: 0.5, fill: 'rgba(0,150,136,0.06)', line: 'rgba(0,150,136,0.7)', label: '0.5' },
  { ratio: 0.618, fill: 'rgba(255,152,0,0.06)', line: 'rgba(255,152,0,0.7)', label: '0.618' },
  { ratio: 0.786, fill: 'rgba(255,87,34,0.06)', line: 'rgba(255,87,34,0.7)', label: '0.786' },
  { ratio: 1, fill: 'rgba(244,67,54,0.06)', line: 'rgba(244,67,54,0.7)', label: '1' },
]

/** Every pattern-overlay name this module registers, keyed the same way the Patterns flyout uses them. */
export const PATTERN_OVERLAY_NAMES = [
  'fibonacciLineStyled',
  'HeadAndShoulders',
  'InverseHeadAndShoulders',
  'DoubleTop',
  'DoubleBottom',
  'TriangleAscending',
  'TriangleDescending',
  'TriangleSymmetric',
  'WedgeRising',
  'WedgeFalling',
  'FlagBull',
  'FlagBear',
  'CupAndHandle',
  'XABCD',
  'ABCD',
] as const

export type PatternOverlayName = (typeof PATTERN_OVERLAY_NAMES)[number]

export function registerChartPatterns(): void {
  if (registered) return
  registered = true

  // ── TradingView-style Fibonacci Retracement ────────────────────────────────
  registerOverlay({
    name: 'fibonacciLineStyled',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, yAxis }) => {
      if (coordinates.length < 2 || !yAxis) return []

      const price1 = yAxis.convertFromPixel(coordinates[0].y)
      const price2 = yAxis.convertFromPixel(coordinates[1].y)
      const low = Math.min(price1, price2)
      const high = Math.max(price1, price2)
      const range = high - low

      const left = 0
      const right = bounding.width

      const figs = []

      for (let i = 0; i < FIB_LEVELS.length; i++) {
        const level = FIB_LEVELS[i]
        const price = high - level.ratio * range
        const y = yAxis.convertToPixel(price)

        if (i < FIB_LEVELS.length - 1) {
          const nextPrice = high - FIB_LEVELS[i + 1].ratio * range
          const nextY = yAxis.convertToPixel(nextPrice)
          figs.push({
            type: 'polygon',
            ignoreEvent: true,
            attrs: {
              coordinates: [
                { x: left, y },
                { x: right, y },
                { x: right, y: nextY },
                { x: left, y: nextY },
              ],
            },
            styles: { style: 'fill', color: level.fill },
          })
        }

        figs.push({
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [{ x: left, y }, { x: right, y }] },
          styles: { style: 'solid', size: 1, color: level.line },
        })

        figs.push({
          type: 'text',
          ignoreEvent: true,
          attrs: { x: right - 6, y: y - 4, text: `${level.label}`, align: 'right', baseline: 'bottom' },
          styles: { color: level.line, size: 10, family: 'inherit', weight: 'normal' },
        })
      }

      return figs
    },
  })

  registerOverlay({
    name: 'HeadAndShoulders',
    totalStep: 5,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      const c = coordinates
      const figs = []
      for (let i = 1; i < c.length; i++) figs.push({ type: 'line', attrs: { coordinates: [c[i - 1], c[i]] } })
      return figs
    },
  })

  registerOverlay({
    name: 'InverseHeadAndShoulders',
    totalStep: 5,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      const c = coordinates
      const figs = []
      for (let i = 1; i < c.length; i++) figs.push({ type: 'line', attrs: { coordinates: [c[i - 1], c[i]] } })
      return figs
    },
  })

  registerOverlay({
    name: 'DoubleTop',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      const c = coordinates
      const figs = []
      if (c.length >= 2) figs.push({ type: 'line', attrs: { coordinates: [c[0], c[1]] } })
      if (c.length >= 3) figs.push({ type: 'line', attrs: { coordinates: [c[1], c[2]] } })
      if (c.length >= 3) figs.push({ type: 'line', attrs: { coordinates: [c[0], c[2]] }, styles: { style: 'dashed', dashedValue: [4, 4], color: '#f59e0b' } })
      return figs
    },
  })

  registerOverlay({
    name: 'DoubleBottom',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      const c = coordinates
      const figs = []
      if (c.length >= 2) figs.push({ type: 'line', attrs: { coordinates: [c[0], c[1]] } })
      if (c.length >= 3) figs.push({ type: 'line', attrs: { coordinates: [c[1], c[2]] } })
      if (c.length >= 3) figs.push({ type: 'line', attrs: { coordinates: [c[0], c[2]] }, styles: { style: 'dashed', dashedValue: [4, 4], color: '#f59e0b' } })
      return figs
    },
  })

  const trianglePattern = (name: string, totalStep: number) => ({
    name,
    totalStep,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }: { coordinates: Array<{ x: number; y: number }> }) => {
      const c = coordinates
      const figs = []
      for (let i = 1; i < c.length; i++) figs.push({ type: 'line', attrs: { coordinates: [c[i - 1], c[i]] } })
      if (c.length === totalStep - 1) figs.push({ type: 'line', attrs: { coordinates: [c[c.length - 1], c[0]] }, styles: { style: 'dashed', dashedValue: [4, 4], color: '#f59e0b' } })
      return figs
    },
  })

  registerOverlay(trianglePattern('TriangleAscending', 5))
  registerOverlay(trianglePattern('TriangleDescending', 5))
  registerOverlay(trianglePattern('TriangleSymmetric', 5))

  const wedgePattern = (name: string) => ({
    name,
    totalStep: 5,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }: { coordinates: Array<{ x: number; y: number }> }) => {
      const c = coordinates
      const figs = []
      for (let i = 1; i < c.length; i++) figs.push({ type: 'line', attrs: { coordinates: [c[i - 1], c[i]] } })
      if (c.length === 4) {
        figs.push({ type: 'line', attrs: { coordinates: [c[3], c[0]] }, styles: { style: 'dashed', dashedValue: [4, 4], color: '#6366f1' } })
        figs.push({ type: 'polygon', attrs: { coordinates: c }, styles: { style: 'fill', color: 'rgba(99,102,241,0.08)' }, ignoreEvent: true })
      }
      return figs
    },
  })

  registerOverlay(wedgePattern('WedgeRising'))
  registerOverlay(wedgePattern('WedgeFalling'))

  const flagPattern = (name: string) => ({
    name,
    totalStep: 5,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }: { coordinates: Array<{ x: number; y: number }> }) => {
      const c = coordinates
      const figs = []
      for (let i = 1; i < c.length; i++) figs.push({ type: 'line', attrs: { coordinates: [c[i - 1], c[i]] } })
      return figs
    },
  })

  registerOverlay(flagPattern('FlagBull'))
  registerOverlay(flagPattern('FlagBear'))

  registerOverlay({
    name: 'CupAndHandle',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      const c = coordinates
      const figs = []
      if (c.length >= 2) figs.push({ type: 'line', attrs: { coordinates: [c[0], c[1]] } })
      if (c.length >= 3) figs.push({ type: 'line', attrs: { coordinates: [c[1], c[2]] } })
      return figs
    },
  })

  registerOverlay({
    name: 'XABCD',
    totalStep: 5,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      const c = coordinates
      const figs = []
      for (let i = 1; i < c.length; i++) figs.push({ type: 'line', attrs: { coordinates: [c[i - 1], c[i]] } })
      return figs
    },
  })

  registerOverlay({
    name: 'ABCD',
    totalStep: 5,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      const c = coordinates
      const figs = []
      for (let i = 1; i < c.length; i++) figs.push({ type: 'line', attrs: { coordinates: [c[i - 1], c[i]] } })
      return figs
    },
  })
}
