import { describe, expect, it } from 'vitest'
import { clockPhase, formatCountdown, liveCardView, type LiveCardInput } from './liveCard'

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
  it('the last minutes before the close are still open and joinable', () => {
    expect(liveCardView({ ...base, phase: 'closing', now: '2026-10-12T15:20:00' })).toMatchObject({ status: 'Open now', canJoin: true, big: '0:10:00' })
  })
  it('closed: ended, next open time, Join disabled', () => {
    expect(liveCardView({ ...base, phase: 'closed', now: '2026-10-12T16:00:00' })).toMatchObject({ status: 'Ended', big: '09:15', counting: false, canJoin: false })
  })
  it("decides the state from the clock, not the backend's phase", () => {
    // 17:10 with a 09:15-15:30 market: closed, whatever the backend says
    const late = { ...base, now: '2026-10-12T17:10:00' }
    for (const phase of ['preopen', 'open', 'closing', 'closed'] as const) {
      expect(liveCardView({ ...late, phase })).toMatchObject({ status: 'Ended', canJoin: false, label: 'Next session opens at', big: '09:15' })
    }
    // 08:50: pre-open even if the backend says open
    expect(liveCardView({ ...base, phase: 'open', now: '2026-10-12T08:50:00' })).toMatchObject({ label: 'Opens in', canJoin: false, big: '0:25:00' })
    // 10:00: open even if the backend says closed
    expect(liveCardView({ ...base, phase: 'closed', now: '2026-10-12T10:00:00' })).toMatchObject({ status: 'Open now', canJoin: true, label: 'Closes in', big: '5:30:00' })
  })
  it('falls back to the backend phase only when there is no clock yet', () => {
    expect(liveCardView({ ...base, phase: 'open', now: undefined })).toMatchObject({ status: 'Open now', canJoin: true, counting: false, big: '15:30' })
    expect(liveCardView({ ...base, phase: 'preopen', now: undefined })).toMatchObject({ canJoin: false, big: '09:15' })
  })
  it('in the live session: return to it, with the close countdown', () => {
    expect(liveCardView({ ...base, phase: 'open', now: '2026-10-12T15:00:00', inLive: true })).toMatchObject({
      status: "You're in this session", button: 'return', big: '0:30:00', label: 'Closes in', canJoin: true,
    })
    expect(liveCardView({ ...base, phase: 'closed', now: '2026-10-12T16:00:00', inLive: true })).toMatchObject({ status: 'Market closed', big: '15:30', button: 'return' })
  })
})

describe('clockPhase', () => {
  const o = '2026-10-12T09:15:00'
  const c = '2026-10-12T15:30:00'
  it('derives the state from the clock', () => {
    expect(clockPhase('2026-10-12T08:00:00', o, c, 'open')).toBe('preopen')
    expect(clockPhase('2026-10-12T12:00:00', o, c, 'closed')).toBe('open')
    expect(clockPhase('2026-10-12T15:27:00', o, c, 'open')).toBe('closing')
    expect(clockPhase('2026-10-12T15:30:00', o, c, 'open')).toBe('closed')
    expect(clockPhase('2026-10-12T17:14:54', o, c, 'open')).toBe('closed')
  })
  it('a practice session (no opening time) is open until it ends', () => {
    expect(clockPhase('2026-10-12T23:00:00', undefined, '2026-10-13T00:30:00', 'closed')).toBe('open')
    expect(clockPhase('2026-10-13T00:31:00', undefined, '2026-10-13T00:30:00', 'open')).toBe('closed')
  })
  it('falls back to the backend only without a clock or a close time', () => {
    expect(clockPhase(undefined, o, c, 'preopen')).toBe('preopen')
    expect(clockPhase('2026-10-12T12:00:00', o, undefined, 'closed')).toBe('closed')
  })
})
