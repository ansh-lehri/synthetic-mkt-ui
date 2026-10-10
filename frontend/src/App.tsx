import { useState } from 'react'
import { useMarkets } from './api'
import { ThemeToggle } from './components/ThemeToggle'

// Phase 0 smoke harness — NOT a screen. It proves: tokens + theme toggle work, and the
// frontend can call GET /v1/markets on the mock (base URL from env) and render a dropdown.
// Real screens (TopBar, Terminal, ...) arrive in later phases.
export default function App() {
  const markets = useMarkets()
  const [selected, setSelected] = useState<string>('')

  const list = markets.data?.markets ?? []
  const value = selected || list[0]?.code || ''

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-3">
        <span className="font-semibold">Market Simulator</span>
        <span className="rounded-pill border border-line px-2 py-0.5 text-xs text-muted">Simulation</span>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Market
            {markets.isPending ? (
              <span role="status">Loading markets…</span>
            ) : markets.isError ? (
              <span role="alert" className="text-loss">
                Could not load markets: {markets.error.message}
              </span>
            ) : (
              <select
                value={value}
                onChange={(e) => setSelected(e.target.value)}
                className="min-h-[44px] rounded-sm border border-line bg-raised px-3 text-ink"
              >
                {list.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name} ({m.code})
                  </option>
                ))}
              </select>
            )}
          </label>
          <ThemeToggle />
        </div>
      </header>

      <main className="px-4 py-5">
        <p className="text-sm text-muted">
          Phase 0 scaffold — screens come in later phases.
        </p>
        <p className="mt-3 flex flex-wrap gap-4 text-sm">
          <a className="font-semibold underline underline-offset-4" href="/record">Record</a>
          <a className="font-semibold underline underline-offset-4" href="/kit">Component kit</a>
        </p>
      </main>
    </div>
  )
}
