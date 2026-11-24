// Two indicators KLineCharts doesn't ship built-in. Ported verbatim (calc logic
// unchanged) from the reference charting project's registerIndicator calls.
import { registerIndicator } from 'klinecharts'

let registered = false

interface Bar {
  high: number
  low: number
  close: number
  volume?: number
}

export function registerCustomIndicators(): void {
  if (registered) return
  registered = true

  // ── Aroon ────────────────────────────────────────────────────────────────
  // Aroon Up   = ((n - bars since n-period high) / n) * 100
  // Aroon Down = ((n - bars since n-period low)  / n) * 100
  registerIndicator({
    name: 'AROON',
    shortName: 'Aroon',
    calcParams: [14],
    figures: [
      { key: 'aroonUp', title: 'Up: ', type: 'line' },
      { key: 'aroonDown', title: 'Down: ', type: 'line' },
    ],
    calc: (dataList: Bar[], { calcParams }: { calcParams: number[] }) => {
      const n = calcParams[0]
      return dataList.map((_, idx) => {
        if (idx < n) return { aroonUp: null, aroonDown: null }

        let highestIdx = idx
        let lowestIdx = idx
        for (let i = idx - n; i <= idx; i++) {
          if (dataList[i].high > dataList[highestIdx].high) highestIdx = i
          if (dataList[i].low < dataList[lowestIdx].low) lowestIdx = i
        }

        const aroonUp = ((n - (idx - highestIdx)) / n) * 100
        const aroonDown = ((n - (idx - lowestIdx)) / n) * 100
        return { aroonUp, aroonDown }
      })
    },
  })

  // ── Accumulation / Distribution ──────────────────────────────────────────
  // MFM = ((close - low) - (high - close)) / (high - low)
  // AD  = running sum of MFM × volume
  registerIndicator({
    name: 'AD',
    shortName: 'AD',
    figures: [{ key: 'ad', title: 'AD: ', type: 'line' }],
    calc: (dataList: Bar[]) => {
      let ad = 0
      return dataList.map(({ high, low, close, volume }) => {
        const range = high - low
        if (range !== 0) {
          const mfm = (close - low - (high - close)) / range
          ad += mfm * (volume ?? 0)
        }
        return { ad }
      })
    },
  })
}
