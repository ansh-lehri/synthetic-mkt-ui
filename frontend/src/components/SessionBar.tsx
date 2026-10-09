import { useState } from 'react'
import { cx } from '../lib/cx'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'

export type SessionPhase = 'preopen' | 'open' | 'closing' | 'closed'
export type SessionMode = 'live' | 'practice'

const PHASE: Record<SessionPhase, { label: string; glyph: string; tone: string }> = {
  preopen: { label: 'Pre-open', glyph: '○', tone: 'text-muted' },
  open: { label: 'Open', glyph: '●', tone: 'text-buy' },
  closing: { label: 'Closing', glyph: '◆', tone: 'text-warn' },
  closed: { label: 'Closed', glyph: '■', tone: 'text-muted' },
}

export interface SessionBarProps {
  mode: SessionMode
  /** Market display name, e.g. "India". */
  market: string
  phase: SessionPhase
  /** Market-local clock, naive ISO time as received (no UTC conversion), e.g. "10:42:15". */
  clock: string
  /** IANA timezone named by the contract, e.g. "Asia/Kolkata". */
  timezone: string
  /** Practice only: scenario label, e.g. "Whipsaw". */
  condition?: string
  /** Called after the user confirms leaving the session. */
  onExit: () => void
  className?: string
}

/** Live vs practice treatment, market, clock, phase, and the red Exit with its one-session confirm. */
export function SessionBar({ mode, market, phase, clock, timezone, condition, onExit, className }: SessionBarProps) {
  const [confirming, setConfirming] = useState(false)
  const p = PHASE[phase]
  const practice = mode === 'practice'

  return (
    <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-4 py-2', className)}>
      <span
        className={cx(
          'inline-flex items-center gap-1 rounded-pill border px-3 py-1 text-xs font-semibold',
          practice ? 'border-dashed border-warn text-ink' : 'border-solid border-buy text-ink',
        )}
      >
        <span aria-hidden="true">{practice ? '◇' : '◆'}</span>
        {practice ? 'Practice' : 'Live session'}
      </span>

      <span className="text-sm font-medium">{market}</span>
      {practice && condition && <span className="text-sm text-muted">{condition}</span>}

      <span className={cx('inline-flex items-center gap-1 text-sm font-medium', p.tone)}>
        <span aria-hidden="true">{p.glyph}</span>
        <span className="text-ink">
          <span className="sr-only">Phase: </span>
          {p.label}
        </span>
      </span>

      <span className="font-mono text-sm tabular-nums" title={timezone}>
        {clock} <span className="text-xs text-muted">{timezone}</span>
      </span>

      {practice && <span className="text-xs text-muted">Practice results are not recorded</span>}

      <Button variant="exit" className="ml-auto" onClick={() => setConfirming(true)}>
        Exit
      </Button>

      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={practice ? 'Exit practice session?' : 'Exit the live session?'}
        description={
          practice
            ? 'This ends your practice session. Practice trades are not recorded.'
            : 'You can only be in one session at a time. Open orders stay with the exchange; you can rejoin while the market is open.'
        }
        confirmLabel="Exit session"
        cancelLabel="Stay"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          onExit()
        }}
      />
    </div>
  )
}
