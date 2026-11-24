// Browser-local persistence for the chart's active indicators (name + calcParams), so they
// survive a reload. Explicitly NOT a durable/server-side preference — per-browser only, and
// losing it is harmless (the user just re-adds from the Indicators dropdown).
const STORAGE_KEY = 'terminal.chart.indicators'

export interface ActiveIndicator {
  name: string
  calcParams?: number[]
}

export function loadIndicatorPrefs(): ActiveIndicator[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is ActiveIndicator => typeof p?.name === 'string')
  } catch {
    return []
  }
}

export function saveIndicatorPrefs(active: ActiveIndicator[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(active))
  } catch {
    // storage unavailable — the chart still works, indicators just won't survive a reload
  }
}
