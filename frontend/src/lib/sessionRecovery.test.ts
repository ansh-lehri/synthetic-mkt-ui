import { describe, expect, it } from 'vitest'
import { chooseBalanceEndpoint, type CurrentSessionState } from './sessionRecovery'

describe('chooseBalanceEndpoint', () => {
  it('picks balance when a session is active, cash when there is none', () => {
    const found: CurrentSessionState = { kind: 'found', sessionId: 's1', mode: 'canonical', market: 'IN', status: 'active' }
    const none: CurrentSessionState = { kind: 'none' }
    expect(chooseBalanceEndpoint(found)).toBe('balance')
    expect(chooseBalanceEndpoint(none)).toBe('cash')
  })
})
