import { describe, expect, it } from 'vitest'
import { formatCountdown, liveCardView, type LiveCardInput } from './liveCard'

const base: LiveCardInput = {
  phase: 'preopen', opensAt: '2026-10-12T09:15:00', closesAt: '2026-10-12T15:30:00', now: '2026-10-12T08:50:00', inLive: false,
}

describe('formatCountdown', () => {
  it('formats H:MM:SS and never goes negative', () => {
    expect(formatCountdown(3725)).toBe('1:02:05')
    expect(formatCountdown(59)).toBe('0:00:59')
    expect(formatCountdown(-5)).toBe('0:00:00')
  })
})

describe('liveCardView', () => {
  it('before the open: counts down to opens_at and Join is disabled', () => {
    const v = liveCardView(base)
    expect(v).toMatchObject({ status: 'Opens at 09:15', label: 'Opens in', big: '0:25:00', counting: true, canJoin: false, button: 'join', dot: 'hollow' })
    expect(v.note).toBe('You can join from 09:15.')
  })
  it('open: counts down to the close and Join is enabled', () => {
    const v = liveCardView({ ...base, phase: 'open', now: '2026-10-12T14:00:00' })
    expect(v).toMatchObject({ status: 'Open now', label: 'Closes in', big: '1:30:00', counting: true, canJoin: true, dot: 'solid' })
    expect(v.note).toBe('Open positions close automatically at 15:30.')
  })
  it('closing is still joinable', () => {
    expect(liveCardView({ ...base, phase: 'closing', now: '2026-10-12T15:20:00' })).toMatchObject({ status: 'Closing soon', canJoin: true, big: '0:10:00' })
  })
  it('closed: ended, next open time, Join disabled', () => {
    expect(liveCardView({ ...base, phase: 'closed', now: '2026-10-12T16:00:00' })).toMatchObject({ status: 'Ended', big: '09:15', counting: false, canJoin: false })
  })
  it('shows times, not a bogus countdown, when the clock and the phase disagree', () => {
    // backend says open but the local clock is past the close
    expect(liveCardView({ ...base, phase: 'open', now: '2026-10-12T23:41:00' })).toMatchObject({ label: 'Closes at', big: '15:30', counting: false, canJoin: true })
    // backend says pre-open but the clock is already past the open
    expect(liveCardView({ ...base, phase: 'preopen', now: '2026-10-12T10:00:00' })).toMatchObject({ label: 'Opens at', big: '09:15', counting: false })
    // no clock yet
    expect(liveCardView({ ...base, now: undefined })).toMatchObject({ big: '09:15', counting: false })
  })
  it('in the live session: return to it, with the close countdown', () => {
    expect(liveCardView({ ...base, phase: 'open', now: '2026-10-12T15:00:00', inLive: true })).toMatchObject({
      status: "You're in this session", button: 'return', big: '0:30:00', label: 'Closes in', canJoin: true,
    })
    expect(liveCardView({ ...base, phase: 'closed', now: '2026-10-12T16:00:00', inLive: true })).toMatchObject({ status: 'Market closed', big: '15:30', button: 'return' })
  })
})
