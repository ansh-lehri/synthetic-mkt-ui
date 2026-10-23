import { describe, expect, it } from 'vitest'
import { resolveIdentityScreen } from './identity'

describe('resolveIdentityScreen', () => {
  it('shows Signup only when no account_id is stored yet', () => {
    expect(resolveIdentityScreen(null)).toBe('signup')
    expect(resolveIdentityScreen('acct_8f2c1e')).toBe('ready')
  })
})
