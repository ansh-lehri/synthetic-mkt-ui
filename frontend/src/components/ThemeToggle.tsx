import { useState } from 'react'
import { applyTheme, currentTheme, type Theme } from '../lib/theme'

const LABEL: Record<Theme, string> = { night: 'Night', lab: 'Lab' }

/** Night/Lab switch. Flips data-theme on <html>; persisted in localStorage. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const next: Theme = theme === 'night' ? 'lab' : 'night'

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next)
        setTheme(next)
      }}
      aria-label={`Switch to ${LABEL[next]} theme`}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-line bg-raised px-4 text-sm text-ink hover:bg-panel"
    >
      <span aria-hidden="true">{theme === 'night' ? '☾' : '☀'}</span>
      {LABEL[theme]}
    </button>
  )
}
