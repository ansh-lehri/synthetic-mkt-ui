import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { isExitSuccess, isSessionConflict, ondemandPath } from './sessionActions'

describe('ondemandPath', () => {
  it('builds the exact query string the real backend expects', () => {
    expect(ondemandPath('IN', 60)).toBe('/session/ondemand?market=IN&duration=60')
    expect(ondemandPath('IN', 90)).toBe('/session/ondemand?market=IN&duration=90')
  })
})

describe('isExitSuccess', () => {
  it('treats 200 and 404 as success (on-demand already-reaped asymmetry)', () => {
    expect(isExitSuccess(200)).toBe(true)
    expect(isExitSuccess(404)).toBe(true)
    expect(isExitSuccess(400)).toBe(false)
    expect(isExitSuccess(500)).toBe(false)
  })
})

describe('isSessionConflict', () => {
  it('is true only for a 409, regardless of body shape', () => {
    expect(isSessionConflict(new ApiError(409, 'already live on another session'))).toBe(true)
    expect(isSessionConflict(new ApiError(400, 'bad request'))).toBe(false)
    expect(isSessionConflict(new Error('network down'))).toBe(false)
  })
})
