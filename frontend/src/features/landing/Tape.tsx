import { useEffect, useRef, useState } from 'react'

interface TapeRow {
  kind: 'buy' | 'sell' | 'mid'
  price: number
  qty?: number
}

interface TapeState {
  rows: TapeRow[]
  last: number
  spread: number
}

const BASE = 1420
const AGENTS = 62

function seed(): TapeState {
  const rows: TapeRow[] = [
    { kind: 'sell', price: BASE + 8, qty: 20 + Math.round(Math.random() * 120) },
    { kind: 'sell', price: BASE + 6, qty: 20 + Math.round(Math.random() * 120) },
    { kind: 'sell', price: BASE + 4, qty: 20 + Math.round(Math.random() * 120) },
    { kind: 'mid',  price: BASE },
    { kind: 'buy',  price: BASE - 2, qty: 20 + Math.round(Math.random() * 120) },
    { kind: 'buy',  price: BASE - 4, qty: 20 + Math.round(Math.random() * 120) },
    { kind: 'buy',  price: BASE - 6, qty: 20 + Math.round(Math.random() * 120) },
  ]
  return {
    rows,
    last: BASE - 2 + Math.round(Math.random() * 6),
    spread: 2 + Math.round(Math.random() * 3),
  }
}

function tick(prev: TapeState): TapeState {
  const rows = prev.rows.map((r) =>
    r.kind === 'mid' ? r : { ...r, qty: 20 + Math.round(Math.random() * 120) }
  )
  return {
    rows,
    last: BASE - 2 + Math.round(Math.random() * 6),
    spread: 2 + Math.round(Math.random() * 3),
  }
}

/** Animated order-book tape panel. Purely decorative — aria-hidden. */
export default function Tape() {
  const [state, setState] = useState<TapeState>(seed)
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    if (reducedMotion.current) return
    const id = setInterval(() => setState(tick), 1300)
    return () => clearInterval(id)
  }, [])

  const qtys = state.rows.map((r) => r.qty ?? 0)
  const maxQty = Math.max(...qtys, 1)

  return (
    <div className="l-tape" aria-hidden="true">
      <div className="l-tape-top">
        <span className="l-dot" />
        <span className="l-tape-pair">SYNTH_DEF</span>
        <span>· India</span>
        <span className="l-tape-phase">CONTINUOUS</span>
      </div>

      <div className="l-tape-rows">
        {state.rows.map((row, i) => {
          if (row.kind === 'mid') {
            return (
              <div key={i} className="l-trow mid">
                <span className="l-trow-side l-mono">MID</span>
                <span className="l-qty-bar"><span className="l-qty-bar-fill" style={{ width: 0 }} /></span>
                <span className="l-trow-px l-mono">{row.price}</span>
              </div>
            )
          }
          const pct = Math.round((( row.qty ?? 0) / maxQty) * 100)
          return (
            <div key={i} className={`l-trow ${row.kind}`}>
              <span className="l-trow-side">{row.kind === 'buy' ? 'BID' : 'ASK'}</span>
              <span className="l-qty-bar">
                <span className="l-qty-bar-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="l-trow-px l-mono">{row.price}</span>
            </div>
          )
        })}
      </div>

      <div className="l-tape-foot">
        <span>last <b>{state.last}</b></span>
        <span>spread <b>{state.spread}</b></span>
        <span>agents <b>{AGENTS}</b></span>
      </div>
    </div>
  )
}
