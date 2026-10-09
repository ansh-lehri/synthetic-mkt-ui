import { describe, expect, it } from 'vitest'
import {
  MINUS,
  PLACEHOLDER,
  formatMoney,
  formatPercent,
  formatPrice,
  formatQty,
  formatSignedMoney,
  formatSignedPrice,
  isTickAligned,
  moneyChange,
  parsePrice,
  percentChange,
  priceChange,
  snapToTick,
  stepPrice,
  type PriceFormat,
} from './ticks'

const inr: PriceFormat = { tick_size: 5, price_decimals: 2 }
const whole: PriceFormat = { tick_size: 1, price_decimals: 0 }
const fine: PriceFormat = { tick_size: 1, price_decimals: 4 }

describe('formatPrice', () => {
  it('scales by price_decimals', () => {
    expect(formatPrice(10050, inr)).toBe('100.50')
    expect(formatPrice(10085, inr)).toBe('100.85')
    expect(formatPrice(5, inr)).toBe('0.05')
    expect(formatPrice(0, inr)).toBe('0.00') // 0 is a valid price
  })

  it('handles 0 and many decimals', () => {
    expect(formatPrice(123, whole)).toBe('123')
    expect(formatPrice(1, fine)).toBe('0.0001')
    expect(formatPrice(123456789, fine)).toBe('12345.6789')
  })

  it('is ungrouped by default, en-IN grouped on request', () => {
    expect(formatPrice(123456789, inr)).toBe('1234567.89')
    expect(formatPrice(123456789, inr, { group: true })).toBe('12,34,567.89')
  })

  it('uses a typographic minus for negatives', () => {
    expect(formatPrice(-10050, inr)).toBe(`${MINUS}100.50`)
  })

  it('is exact beyond 2^53 with bigint', () => {
    expect(formatPrice(9007199254740993n, whole)).toBe('9007199254740993')
  })

  it('returns a placeholder for non-finite input', () => {
    expect(formatPrice(NaN, inr)).toBe(PLACEHOLDER)
    expect(formatPrice(Infinity, inr)).toBe(PLACEHOLDER)
  })

  it('rejects an invalid price_decimals', () => {
    expect(() => formatPrice(1, { tick_size: 1, price_decimals: -1 })).toThrow(RangeError)
    expect(() => formatPrice(1, { tick_size: 1, price_decimals: 1.5 })).toThrow(RangeError)
  })
})

describe('priceChange / formatSignedPrice', () => {
  it('signs and directs', () => {
    expect(priceChange(25, inr)).toEqual({ text: '+0.25', direction: 'up' })
    expect(priceChange(-110, inr)).toEqual({ text: `${MINUS}1.10`, direction: 'down' })
    expect(priceChange(0, inr)).toEqual({ text: '0.00', direction: 'flat' })
    expect(formatSignedPrice(25, inr)).toBe('+0.25')
  })
})

describe('formatMoney (units label, en-IN)', () => {
  it('uses lakh/crore grouping and the plain units label', () => {
    expect(formatMoney(0)).toBe('0.00 units')
    expect(formatMoney(100)).toBe('1.00 units')
    expect(formatMoney(99999)).toBe('999.99 units')
    expect(formatMoney(100000)).toBe('1,000.00 units')
    expect(formatMoney(12345678)).toBe('1,23,456.78 units')
    expect(formatMoney(123456789012)).toBe('1,23,45,67,890.12 units')
  })

  it('has no currency symbol', () => {
    expect(formatMoney(25_000_000)).not.toMatch(/[₹$€£]/)
  })

  it('shows negatives (available may be negative: debt is legal)', () => {
    expect(formatMoney(-150000)).toBe(`${MINUS}1,500.00 units`)
  })

  it('supports no label and custom decimals', () => {
    expect(formatMoney(12345678, { label: false })).toBe('1,23,456.78')
    expect(formatMoney(12345, { decimals: 0 })).toBe('12,345 units')
  })

  it('is exact beyond 2^53 with bigint', () => {
    expect(formatMoney(9007199254740993n, { decimals: 0, label: false })).toBe('9,00,71,99,25,47,40,993')
  })

  it('returns a placeholder for non-finite input', () => {
    expect(formatMoney(NaN)).toBe(PLACEHOLDER)
  })
})

describe('moneyChange / formatSignedMoney', () => {
  it('signs P&L and sets direction', () => {
    expect(moneyChange(418800)).toEqual({ text: '+4,188.00 units', direction: 'up' })
    expect(moneyChange(-31200)).toEqual({ text: `${MINUS}312.00 units`, direction: 'down' })
    expect(moneyChange(0)).toEqual({ text: '0.00 units', direction: 'flat' })
    expect(formatSignedMoney(418800, { label: false })).toBe('+4,188.00')
  })

  it('non-finite is flat, never a direction', () => {
    expect(moneyChange(NaN)).toEqual({ text: PLACEHOLDER, direction: 'flat' })
  })
})

describe('percentChange / formatPercent', () => {
  it('signs and directs', () => {
    expect(percentChange(1.37)).toEqual({ text: '+1.37%', direction: 'up' })
    expect(percentChange(-0.5)).toEqual({ text: `${MINUS}0.50%`, direction: 'down' })
    expect(percentChange(0)).toEqual({ text: '0.00%', direction: 'flat' })
    expect(formatPercent(12.3456, { decimals: 1 })).toBe('+12.3%')
  })

  it('direction follows the rounded value (no ▲ on "0.00%")', () => {
    expect(percentChange(0.001)).toEqual({ text: '0.00%', direction: 'flat' })
    expect(percentChange(-0.004)).toEqual({ text: '0.00%', direction: 'flat' })
    expect(percentChange(-0)).toEqual({ text: '0.00%', direction: 'flat' })
  })

  it('placeholder for non-finite', () => {
    expect(percentChange(NaN)).toEqual({ text: PLACEHOLDER, direction: 'flat' })
  })
})

describe('formatQty', () => {
  it('groups en-IN and signs shorts', () => {
    expect(formatQty(0)).toBe('0')
    expect(formatQty(999)).toBe('999')
    expect(formatQty(1234567)).toBe('12,34,567')
    expect(formatQty(-100)).toBe(`${MINUS}100`)
  })
})

describe('tick grid', () => {
  it('isTickAligned', () => {
    expect(isTickAligned(10050, 5)).toBe(true)
    expect(isTickAligned(10052, 5)).toBe(false)
    expect(isTickAligned(0, 5)).toBe(true)
    expect(isTickAligned(NaN, 5)).toBe(false)
  })

  it('snapToTick', () => {
    expect(snapToTick(10052, 5)).toBe(10050)
    expect(snapToTick(10053, 5)).toBe(10055)
    expect(snapToTick(10052, 5, 'up')).toBe(10055)
    expect(snapToTick(10054, 5, 'down')).toBe(10050)
    expect(snapToTick(10050, 5, 'up')).toBe(10050)
    expect(snapToTick(10, 4)).toBe(12) // exact half rounds up
    expect(snapToTick(-3, 5, 'down')).toBe(-5)
    expect(snapToTick(NaN, 5)).toBeNull()
  })

  it('stepPrice moves to the neighbouring tick', () => {
    expect(stepPrice(10050, 5, 1)).toBe(10055)
    expect(stepPrice(10050, 5, -1)).toBe(10045)
    expect(stepPrice(10052, 5, 1)).toBe(10055)
    expect(stepPrice(10052, 5, -1)).toBe(10050)
  })

  it('rejects an invalid tick_size', () => {
    expect(() => isTickAligned(1, 0)).toThrow(RangeError)
    expect(() => snapToTick(1, -5)).toThrow(RangeError)
  })
})

describe('parsePrice (inverse of formatPrice)', () => {
  it('parses to raw units', () => {
    expect(parsePrice('100.50', inr)).toBe(10050)
    expect(parsePrice('100.5', inr)).toBe(10050)
    expect(parsePrice('100', inr)).toBe(10000)
    expect(parsePrice('100.', inr)).toBe(10000)
    expect(parsePrice('0.05', inr)).toBe(5)
    expect(parsePrice('1,00,000.25', inr)).toBe(10000025)
    expect(parsePrice('7', whole)).toBe(7)
  })

  it('rejects rather than rounds or guesses', () => {
    expect(parsePrice('', inr)).toBeNull()
    expect(parsePrice('abc', inr)).toBeNull()
    expect(parsePrice('-1.00', inr)).toBeNull()
    expect(parsePrice('1.234', inr)).toBeNull() // more decimals than allowed
    expect(parsePrice('1.5', whole)).toBeNull()
    expect(parsePrice('1.2.3', inr)).toBeNull()
    expect(parsePrice('99999999999999999999', whole)).toBeNull() // beyond safe range
  })

  it('round-trips with formatPrice', () => {
    for (const raw of [0, 5, 10050, 123456785]) {
      expect(parsePrice(formatPrice(raw, inr), inr)).toBe(raw)
      expect(parsePrice(formatPrice(raw, inr, { group: true }), inr)).toBe(raw)
    }
  })
})
