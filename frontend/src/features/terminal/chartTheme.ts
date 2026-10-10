// KLineCharts draws on a canvas, so it can't use CSS classes. This maps the design TOKENS
// (CSS custom properties) onto the library's style object at runtime — no colour is ever
// written here, only token names — and is re-read when the theme flips.
import type { DeepPartial, Styles } from 'klinecharts'

export type ChartType = 'candles' | 'line'

const FONT = '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif'

/** Read a token from the nearest themed ancestor of `el`. */
function token(el: HTMLElement, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim()
}

export function readChartTheme(el: HTMLElement, type: ChartType): DeepPartial<Styles> {
  const t = (n: string) => token(el, n)
  const text = { family: FONT, size: 12, weight: 400 }
  const axisText = { color: t('--muted'), ...text }
  const crossLabel = { color: t('--bg'), backgroundColor: t('--ink'), borderColor: t('--ink'), ...text }
  const dashed = { style: 'dashed' as const, dashedValue: [4, 4], size: 1, color: t('--muted') }

  return {
    grid: { horizontal: { color: t('--line') }, vertical: { color: t('--line') } },
    candle: {
      type: type === 'line' ? 'area' : 'candle_solid',
      bar: {
        upColor: t('--gain'),
        downColor: t('--loss'),
        noChangeColor: t('--muted'),
        upBorderColor: t('--gain'),
        downBorderColor: t('--loss'),
        noChangeBorderColor: t('--muted'),
        upWickColor: t('--gain'),
        downWickColor: t('--loss'),
        noChangeWickColor: t('--muted'),
      },
      area: {
        lineSize: 2,
        lineColor: t('--ink'),
        backgroundColor: t('--gainBg'),
        point: { show: false },
      },
      priceMark: {
        show: true,
        high: { show: false },
        low: { show: false },
        // The board's last-price line: dashed ink with an ink label.
        last: {
          show: true,
          upColor: t('--ink'),
          downColor: t('--ink'),
          noChangeColor: t('--ink'),
          line: { show: true, style: 'dashed', dashedValue: [4, 4], size: 1 },
          text: { show: true, color: t('--bg'), paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 4, ...text, weight: 600 },
        },
      },
      // The board has its own legend line; the library's OHLC tooltip is off.
      tooltip: { showRule: 'none' },
    },
    indicator: {
      lines: [{ color: t('--ma'), size: 2, style: 'solid', smooth: false, dashedValue: [2, 2] }],
      lastValueMark: { show: false },
      tooltip: { showRule: 'none' },
    },
    xAxis: { axisLine: { color: t('--line') }, tickLine: { color: t('--line') }, tickText: axisText },
    yAxis: { axisLine: { color: t('--line') }, tickLine: { color: t('--line') }, tickText: axisText },
    separator: { color: t('--line') },
    crosshair: {
      horizontal: { line: dashed, text: crossLabel },
      vertical: { line: dashed, text: crossLabel },
    },
    overlay: {
      point: { color: t('--accent'), borderColor: t('--soft'), activeColor: t('--accent'), activeBorderColor: t('--soft') },
      line: { color: t('--accent'), size: 2 },
      rect: { color: t('--soft'), borderColor: t('--accent'), borderSize: 2 },
      // The price / time labels the library adds on the axes while a drawing is selected.
      text: { color: t('--onAccent'), backgroundColor: t('--accent'), borderColor: t('--accent'), family: FONT, size: 12, weight: 500 },
    },
  }
}
