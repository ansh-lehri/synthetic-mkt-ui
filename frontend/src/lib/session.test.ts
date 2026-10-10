import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { clockOf, closeLabel, conditionLabel, exitCopy, isAlreadyInSession, isNoAnswer, orderBlockReason, switchCopy, timeLeft } from './session'

describe('timeLeft', () => {
  it('counts down to the close from naive-local times', () => {
    expect(timeLeft('2026-10-12T10:00:00', '2026-10-12T15:30:00')).toBe('5:30:00')
    expect(timeLeft('2026-10-12T15:29:05', '2026-10-12T15:30:00')).toBe('0:00:55')
  })
  it('never goes negative and is undefined when it cannot be known', () => {
    expect(timeLeft('2026-10-12T15:31:00', '2026-10-12T15:30:00')).toBe('0:00:00')
    expect(timeLeft(undefined, '2026-10-12T15:30:00')).toBeUndefined()
    expect(timeLeft('2026-10-12T10:00:00', null)).toBeUndefined()
    expect(timeLeft('2026-10-12T23:41:00', '2026-10-13T00:56:00')).toBe('1:15:00') // a close past midnight
  })
})

describe('labels', () => {
  it('reads times as received', () => {
    expect(clockOf('2026-10-12T10:42:15')).toBe('10:42:15')
    expect(closeLabel('2026-10-12T15:30:00')).toBe('15:30')
    expect(clockOf(undefined)).toBeUndefined()
  })
  it('labels practice conditions, humanising unknown ones', () => {
    expect(conditionLabel('whipsaw')).toBe('Whipsaw')
    expect(conditionLabel('some_new_one')).toBe('some new one')
    expect(conditionLabel(null)).toBeUndefined()
  })
})

describe('orderBlockReason', () => {
  it('blocks ordering only when closed, with a reason', () => {
    expect(orderBlockReason('closed', 'live')).toMatch(/market is closed/)
    expect(orderBlockReason('closed', 'practice')).toMatch(/practice session has ended/)
    for (const p of ['preopen', 'open', 'closing', undefined]) expect(orderBlockReason(p, 'live')).toBeUndefined()
  })
})

describe('copy', () => {
  it('live exit says positions square off at the close and you can rejoin; practice cannot rejoin', () => {
    expect(exitCopy('live', '15:30').description).toMatch(/closed automatically at the market close \(15:30\).*rejoin until then/)
    expect(exitCopy('practice', undefined).description).toMatch(/cannot rejoin/)
  })
  it('switch copy names both sessions', () => {
    expect(switchCopy('practice', 'live', undefined).title).toBe('Leave practice to join live?')
    expect(switchCopy('live', 'practice', '15:30').description).toMatch(/rejoin the live session until the market closes \(15:30\)/)
  })
})

describe('error classification', () => {
  it('recognises the one-session 409 and unanswered requests', () => {
    expect(isAlreadyInSession(new ApiError(409, 'x', 'already_in_session'))).toBe(true)
    expect(isAlreadyInSession(new ApiError(409, 'x', 'other'))).toBe(false)
    expect(isNoAnswer(new ApiError(504, 'x'))).toBe(true)
    expect(isNoAnswer(new ApiError(0, 'x'))).toBe(true)
    expect(isNoAnswer(new ApiError(503, 'x'))).toBe(false) // service unavailable = a definite refusal
    expect(isNoAnswer(new ApiError(400, 'x'))).toBe(false)
  })
})
