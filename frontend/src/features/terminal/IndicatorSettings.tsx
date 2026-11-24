import { useEffect, useRef, useState } from 'react'
import { paramLabel } from './indicatorDefaults'

export interface IndicatorSettingsProps {
  name: string
  calcParams: number[]
  onApply: (calcParams: number[]) => void
  onClose: () => void
}

/**
 * Small popover for tuning an active indicator's calc params (periods, smoothing, etc.) —
 * opened from the gear on its chip in ChartTab. Patterns have no equivalent: they're
 * hand-drawn shapes with no calculation behind them, so there's no threshold to tune.
 */
export function IndicatorSettings({ name, calcParams, onApply, onClose }: IndicatorSettingsProps) {
  const [values, setValues] = useState<string[]>(calcParams.map(String))
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const apply = () => {
    const parsed = values.map((v, i) => {
      const n = Number(v)
      return Number.isFinite(n) && n > 0 ? Math.round(n) : calcParams[i]
    })
    onApply(parsed)
    onClose()
  }

  return (
    <div
      ref={root}
      role="dialog"
      aria-label={`${name} settings`}
      className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-line bg-panel p-3 shadow-card"
    >
      <p className="mb-2 text-xs font-semibold uppercase text-muted">{name} settings</p>
      <div className="space-y-2">
        {values.map((v, i) => (
          <label key={i} className="flex items-center justify-between gap-2 text-sm text-ink">
            <span className="text-muted">{paramLabel(name, i)}</span>
            <input
              type="number"
              min={1}
              value={v}
              onChange={(e) => setValues((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              className="min-h-[32px] w-20 rounded-sm border border-line bg-raised px-2 text-right text-sm tnum text-ink outline-none focus:outline-2 focus:outline-offset-2 focus:outline-focus"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="min-h-[32px] rounded-sm px-3 text-sm text-muted hover:bg-raised hover:text-ink">
          Cancel
        </button>
        <button type="button" onClick={apply} className="min-h-[32px] rounded-sm bg-btnBg px-3 text-sm font-semibold text-btnFg hover:opacity-90">
          Apply
        </button>
      </div>
    </div>
  )
}
