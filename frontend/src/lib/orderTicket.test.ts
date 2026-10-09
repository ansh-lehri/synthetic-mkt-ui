import { describe, expect, it } from 'vitest'
import { checkTicket, estimateCost, type TicketInstrument } from './orderTicket'

const acme: TicketInstrument = { symbol: 'ACME', tick_size: 5, price_decimals: 2, lot_size: 1 }
const lots: TicketInstrument = { symbol: 'GAMA', tick_size: 1, price_decimals: 2, lot_size: 10 }

describe('checkTicket', () => {
  it('accepts a valid limit order', () => {
    const r = checkTicket({ qtyText: '10', priceText: '100.50', type: 'limit', instrument: acme })
    expect(r).toEqual({ qty: 10, price: 10050, errors: {}, ok: true })
  })

  it('ignores price for market orders', () => {
    const r = checkTicket({ qtyText: '3', priceText: '', type: 'market', instrument: acme })
    expect(r.ok).toBe(true)
    expect(r.price).toBeNull()
  })

  it('rejects bad quantities', () => {
    const t = (qtyText: string, i = acme) => checkTicket({ qtyText, priceText: '1.00', type: 'limit', instrument: i }).errors.qty
    expect(t('')).toBeTruthy()
    expect(t('0')).toBeTruthy()
    expect(t('-1')).toBeTruthy()
    expect(t('1.5')).toBeTruthy()
    expect(t('abc')).toBeTruthy()
    expect(t('15', lots)).toMatch(/multiple of 10/)
    expect(t('20', lots)).toBeUndefined()
  })

  it('rejects bad prices without rounding', () => {
    const t = (priceText: string) => checkTicket({ qtyText: '1', priceText, type: 'limit', instrument: acme }).errors.price
    expect(t('')).toBeTruthy()
    expect(t('0')).toMatch(/greater than 0/)
    expect(t('1.234')).toBeTruthy() // too many decimals
    expect(t('100.52')).toMatch(/multiple of 0.05/) // off the tick grid
    expect(t('100.55')).toBeUndefined()
  })
})

describe('estimateCost', () => {
  it('multiplies exactly', () => {
    expect(estimateCost(10, 10050)).toBe(100500n)
  })
  it('is null when it cannot be estimated', () => {
    expect(estimateCost(null, 10050)).toBeNull()
    expect(estimateCost(10, null)).toBeNull()
  })
})
