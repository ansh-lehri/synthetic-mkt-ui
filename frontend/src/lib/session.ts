// Pure session helpers (no React): the clock, labels and copy for the session bar and the
// join / start / exit flows. Tests live in session.test.ts.
import { ApiError } from '../api/client'
import type { PracticeCondition, PracticeLength } from '../api/types'
import { ordinalMs, timePart } from './naive'

/** Conditions are named by what the market does, not by an event. Descriptions are the board's. */
export const PRACTICE_CONDITIONS: Array<{ value: PracticeCondition; label: string; hint: string }> = [
  { value: 'normal', label: 'Normal day', hint: 'A typical mix of trading. A good place to start.' },
  { value: 'calm', label: 'Calm range', hint: 'Prices drift inside a narrow band.' },
  { value: 'thin', label: 'Trending day', hint: 'Prices lean one way for most of the session.' },
  { value: 'busy', label: 'Whipsaw', hint: 'Prices reverse often. Hard to hold a view.' },
  { value: 'dispersion', label: 'Unstable day', hint: 'Large, fast moves with little warning.' },
]
export const PRACTICE_LENGTHS: PracticeLength[] = [60, 75, 90, 105]
export const DEFAULT_CONDITION: PracticeCondition = 'normal'
export const DEFAULT_LENGTH: PracticeLength = 90

export function conditionLabel(c: string | null | undefined): string | undefined {
  if (!c) return undefined
  return PRACTICE_CONDITIONS.find((x) => x.value === c)?.label ?? c.replace(/_/g, ' ')
}

/** "10:42:15" from a naive-local ISO timestamp — read as received, never converted. */
export function clockOf(naiveNow: string | null | undefined): string | undefined {
  return naiveNow ? timePart(naiveNow) : undefined
}

/** "15:30" — the close as a time of day. */
export function closeLabel(naiveCloses: string | null | undefined): string | undefined {
  return naiveCloses ? timePart(naiveCloses).slice(0, 5) : undefined
}

/**
 * Time left until the close as "H:MM:SS", from two naive-local timestamps (so no real clock and
 * no UTC is involved; a close past midnight is fine). Undefined when either is missing. Never negative.
 */
export function timeLeft(naiveNow: string | null | undefined, naiveCloses: string | null | undefined): string | undefined {
  if (!naiveNow || !naiveCloses) return undefined
  const secs = Math.max(0, Math.round((ordinalMs(naiveCloses) - ordinalMs(naiveNow)) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Why ordering is off in this market phase, or undefined when it is allowed. */
export function orderBlockReason(phase: string | undefined, mode: 'live' | 'practice'): string | undefined {
  if (phase === 'closed') return mode === 'live' ? 'The market is closed, so orders are off until it reopens.' : 'This practice session has ended, so orders are off.'
  return undefined
}

export type SessionMode = 'live' | 'practice'

/** Copy for the Exit confirm. Live: you can rejoin until the close; practice: it ends for good. */
export function exitCopy(mode: SessionMode, closes: string | undefined): { title: string; description: string; confirmLabel: string } {
  return mode === 'live'
    ? {
        title: 'Exit the live session?',
        description: `Open positions are closed automatically at the market close${closes ? ` (${closes})` : ''}. You can rejoin until then.`,
        confirmLabel: 'Exit live session',
      }
    : {
        title: 'Exit practice?',
        description: 'Practice ends for good — you cannot rejoin it, and nothing from it is recorded.',
        confirmLabel: 'Exit practice',
      }
}

/** Copy for "leave the current session to enter the other one" (the one-session rule). */
export function switchCopy(from: SessionMode, to: SessionMode, closes: string | undefined): { title: string; description: string; confirmLabel: string } {
  const leaving =
    from === 'live'
      ? `You can rejoin the live session until the market closes${closes ? ` (${closes})` : ''}. Your open positions stay open and are closed automatically at the close.`
      : 'Practice ends for good and nothing from it is recorded.'
  return {
    title: to === 'live' ? `Leave ${from} to join live?` : `Leave ${from} to start practice?`,
    description: `You can only be in one session at a time. ${leaving}`,
    confirmLabel: to === 'live' ? 'Leave and join live' : 'Leave and start practice',
  }
}

/** Is this the one-session gate ("already in a session") answer? */
export function isAlreadyInSession(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.reason === 'already_in_session'
}

/**
 * A join / start / exit that got no usable answer (no response, 504, other 5xx) — we do not know
 * whether it happened. A 503 is the contract's "service unavailable": a definite refusal.
 */
export function isNoAnswer(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || (err.status >= 500 && err.status !== 503))
}
