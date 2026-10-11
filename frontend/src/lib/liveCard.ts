// What the Home "live session" card says, from the market's phase and its open/close times
// (GET /v1/markets.live_session) and the UI's own market clock. Pure; tests in liveCard.test.ts.
//
// The UI decides open / closed itself: the backend supplies the market's opens_at / closes_at, the
// UI's own market clock supplies "now", and the state follows from comparing them (before the open
// -> pre-open, between -> open, after the close -> ended). The backend's `phase` is used only as a
// fallback while the UI clock is not known yet.
import { ordinalMs, timePart } from './naive'

export type Phase = 'preopen' | 'open' | 'closing' | 'closed'

export interface LiveCardInput {
  phase: Phase
  opensAt: string
  closesAt: string
  /** The market's current naive-local time (the UI's clock), when known. */
  now: string | undefined
  /** The account is in the live session for this market right now. */
  inLive: boolean
}

export interface LiveCardView {
  status: string
  /** Dot on the status pill: solid = trading now. */
  dot: 'solid' | 'hollow'
  label: string
  /** Big figure: a countdown ("1:05:12"), or a time of day when no honest countdown exists. */
  big: string
  /** `big` is a running countdown (so it should be announced as such). */
  counting: boolean
  info: string
  button: 'join' | 'return' | 'none'
  /** The join button is usable (the market is trading). */
  canJoin: boolean
  note: string
}

const hhmm = (naive: string) => timePart(naive).slice(0, 5)

/** "H:MM:SS" for a non-negative number of seconds. */
export function formatCountdown(secs: number): string {
  const s = Math.max(0, Math.round(secs))
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const secsBetween = (from: string, to: string) => (ordinalMs(to) - ordinalMs(from)) / 1000

/** Open / closed from the clock and the backend's times; `fallback` only when there is no clock. */
export function clockPhase(now: string | undefined, opensAt: string, closesAt: string, fallback: Phase): Phase {
  if (!now) return fallback
  if (secsBetween(now, opensAt) > 0) return 'preopen'
  if (secsBetween(now, closesAt) > 0) return 'open'
  return 'closed'
}

export function liveCardView(input: LiveCardInput): LiveCardView {
  const i = { ...input, phase: clockPhase(input.now, input.opensAt, input.closesAt, input.phase) }
  const open = hhmm(i.opensAt)
  const close = hhmm(i.closesAt)
  const base = 'Humans and agents trade together. Everything you do here is recorded.'
  const closeNote = `Open positions close automatically at ${close}.`

  if (i.inLive) {
    const trading = i.phase === 'open' || i.phase === 'closing'
    const left = i.now ? secsBetween(i.now, i.closesAt) : NaN
    const counting = trading && left > 0
    return {
      status: i.phase === 'closed' ? 'Market closed' : "You're in this session",
      dot: trading ? 'solid' : 'hollow',
      label: counting ? 'Closes in' : i.phase === 'closed' ? 'Closed at' : 'Closes at',
      big: counting ? formatCountdown(left) : close,
      counting,
      info: i.phase === 'closed' ? 'This session is read-only now.' : 'You are trading in this session now.',
      button: 'return',
      canJoin: true,
      note: i.phase === 'closed' ? '' : closeNote,
    }
  }

  switch (i.phase) {
    case 'preopen': {
      const until = i.now ? secsBetween(i.now, i.opensAt) : NaN
      const counting = until > 0
      return {
        status: `Opens at ${open}`,
        dot: 'hollow',
        label: counting ? 'Opens in' : 'Opens at',
        big: counting ? formatCountdown(until) : open,
        counting,
        info: base,
        button: 'join',
        canJoin: false,
        note: `You can join from ${open}.`,
      }
    }
    case 'open':
    case 'closing': {
      const left = i.now ? secsBetween(i.now, i.closesAt) : NaN
      const counting = left > 0
      return {
        status: i.phase === 'closing' ? 'Closing soon' : 'Open now',
        dot: 'solid',
        label: counting ? 'Closes in' : 'Closes at',
        big: counting ? formatCountdown(left) : close,
        counting,
        info: base,
        button: 'join',
        canJoin: true,
        note: closeNote,
      }
    }
    default:
      return {
        status: 'Ended',
        dot: 'hollow',
        label: 'Next session opens at',
        big: open,
        counting: false,
        info: "Today's live session has ended. Your trades are in Record.",
        button: 'join',
        canJoin: false,
        note: '',
      }
  }
}
