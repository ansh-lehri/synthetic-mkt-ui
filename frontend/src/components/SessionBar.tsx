import { useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'

export type SessionPhase = 'preopen' | 'open' | 'closing' | 'closed'
export type SessionMode = 'live' | 'practice'

const PHASE: Record<SessionPhase, { label: string; glyph: string; tone: string }> = {
  preopen: { label: 'Pre-open', glyph: '○', tone: 'text-muted' },
  open: { label: 'Open', glyph: '●', tone: 'text-gain' },
  closing: { label: 'Closing', glyph: '◆', tone: 'text-ink' },
  closed: { label: 'Closed', glyph: '■', tone: 'text-muted' },
}

export interface SessionBarProps {
  mode: SessionMode
  /** Market display name, e.g. "India". */
  market: string
  phase: SessionPhase
  /** Market-local time as received (naive ISO time-of-day, no UTC conversion), e.g. "10:42:15". Omit when unknown. */
  clock?: string
  /** Label for `remaining`: "Time left" while trading, "Closes" when only the close time is known. */
  remainingLabel?: string
  remaining?: string
  /** IANA timezone named by the contract, e.g. "Asia/Kolkata". */
  timezone: string
  /** Practice only: scenario label, e.g. "Whipsaw". */
  condition?: string
  /** Extra labelled figures (P&L, open positions…). */
  stats?: Array<{ label: string; value: ReactNode }>
  /** Extra controls next to Exit (e.g. "Start practice"). */
  actions?: ReactNode
  /** Copy of the Exit confirmation. Defaults are generic; the Terminal supplies the real ones. */
  confirm?: { title: string; description: ReactNode; confirmLabel?: string }
  /** The exit request is in flight. */
  exiting?: boolean
  /** Called after the user confirms leaving the session. */
  onExit: () => void
  className?: string
}

/** Live vs practice treatment, market, phase, clock, figures, and the red Exit with its confirm. */
export function SessionBar({
  mode, market, phase, clock, remainingLabel = 'Time left', remaining, timezone, condition, stats, actions, confirm, exiting = false, onExit, className,
}: SessionBarProps) {
  const [confirming, setConfirming] = useState(false)
  const p = PHASE[phase]
  const practice = mode === 'practice'
  const copy = confirm ?? {
    title: practice ? 'Exit practice session?' : 'Exit the live session?',
    description: practice
      ? 'This ends your practice session. Practice trades are not recorded.'
      : 'You can only be in one session at a time. You can rejoin while the market is open.',
  }

  return (
    <div
      className={cx(
        'flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-panel px-4 py-2 sm:px-6 lg:px-8',
        practice ? 'border-dashed border-muted' : 'border-line',
        className,
      )}
    >
      <span
        className={cx(
          'inline-flex items-center gap-1 rounded-pill border px-3 py-1 text-xs font-semibold uppercase tracking-wider',
          practice ? 'border-dashed border-warnLine bg-warnBg text-ink' : 'border-solid border-gain text-ink',
        )}
      >
        <span aria-hidden="true">{practice ? '◇' : '◆'}</span>
        {practice ? 'Practice' : 'Live'}
        <span className="sr-only"> session</span>
      </span>

      <span className="text-lg font-semibold">{market}</span>
      {practice && condition && <span className="text-sm text-muted">{condition}</span>}

      <span className={cx('inline-flex items-center gap-1 text-sm font-medium', p.tone)} data-testid="phase">
        <span aria-hidden="true">{p.glyph}</span>
        <span className="text-ink">
          <span className="sr-only">Phase: </span>
          {p.label}
        </span>
      </span>

      {clock && (
        <span className="flex flex-col" title={timezone}>
          <span className="text-xs text-muted">Market time</span>
          <span className="tnum text-lg font-semibold" data-testid="clock">{clock}</span>
        </span>
      )}
      {remaining && (
        <span className="flex flex-col">
          <span className="text-xs text-muted">{remainingLabel}</span>
          <span className="tnum text-lg font-semibold" data-testid="remaining">{remaining}</span>
        </span>
      )}
      {stats?.map((s) => (
        <span key={s.label} className="flex flex-col">
          <span className="text-xs text-muted">{s.label}</span>
          <span className="text-lg font-semibold">{s.value}</span>
        </span>
      ))}

      {practice && <span className="text-xs text-muted">Practice results are not recorded</span>}

      <span className="ml-auto flex flex-wrap items-center gap-2">
        {actions}
        <Button variant="exit" loading={exiting} onClick={() => setConfirming(true)}>
          Exit
        </Button>
      </span>

      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.confirmLabel ?? 'Exit session'}
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
