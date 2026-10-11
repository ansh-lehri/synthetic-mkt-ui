import { describe, expect, it } from 'vitest'
import { checkTransfer } from './transfer'

describe('checkTransfer', () => {
  it('parses a decimal amount to raw units', () => {
    expect(checkTransfer('125.50', 'to_bank', {})).toEqual({ amount: 12550 })
    expect(checkTransfer('1,000', 'to_trading', {})).toEqual({ amount: 100000 })
    expect(checkTransfer(' 7 ', 'to_bank', {})).toEqual({ amount: 700 })
  })
  it('is quiet while empty and explains bad input without rounding', () => {
    expect(checkTransfer('', 'to_bank', {})).toEqual({ amount: null })
    expect(checkTransfer('1.234', 'to_bank', {}).error).toMatch(/up to 2 decimals/)
    expect(checkTransfer('abc', 'to_bank', {}).error).toBeDefined()
    expect(checkTransfer('-5', 'to_bank', {}).error).toBeDefined()
    expect(checkTransfer('0', 'to_bank', {}).error).toMatch(/greater than 0/)
  })
  it('checks the source balance only when it is known', () => {
    expect(checkTransfer('100.01', 'to_bank', { trading: 10000 }).error).toBe('More than your trading balance')
    expect(checkTransfer('100.00', 'to_bank', { trading: 10000 }).amount).toBe(10000)
    expect(checkTransfer('5', 'to_trading', { bank: 100 }).error).toBe('More than your bank balance')
    expect(checkTransfer('999999', 'to_bank', {}).amount).toBe(99999900) // unknown balance: the server decides
    expect(checkTransfer('999999', 'to_bank', { bank: 1 }).amount).toBe(99999900) // the other side is irrelevant
  })
})
