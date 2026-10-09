// The tick formatter — the ONE place currency/scaling lives. Every numeric display goes
// through here; no component formats a number itself. Pure functions, no React.
//
// MODEL (see CLAUDE.md "Phase 0 decisions"):
//   • Prices and money are bare int64 in raw minor units. No currency field exists.
//   • A price shows as  raw / 10^price_decimals  (e.g. 10050, 2 decimals -> "100.50").
//   • `tick_size` is the smallest legal price increment IN RAW UNITS (e.g. 5 -> prices move
//     in steps of 0.05). It is NOT a display multiplier; it drives alignment, stepping and
//     parsing of order-ticket input.
//   • Money / P&L uses MONEY_DECIMALS (no per-instrument field exists for it), en-IN
//     grouping (12,34,567.00) and the plain "units" label — never a currency symbol.
//   • Signs use "+" and "−" (U+2212). Pair with ▲/▼ via the `direction` of a Change, so
//     colour is never the only cue.
//
// int64 note: JSON numbers above 2^53 lose precision before we ever see them. Formatting
// itself is exact (BigInt) for number | bigint inputs.

/** Plain display unit for money. Single global label — not per-country. */
export const UNITS_LABEL = 'units'

/** Decimals for money/P&L raw values (the contract carries no field for this). */
export const MONEY_DECIMALS = 2

/** Typographic minus used for negative values. */
export const MINUS = '−'

/** Shown instead of a number when the input is not a finite number. */
export const PLACEHOLDER = '—'

export type Direction = 'up' | 'down' | 'flat'

/** Display text + the direction a ▲/▼ + colour component should render. */
export interface Change {
  text: string
  direction: Direction
}

/** The per-instrument formatting contract, straight from GET /v1/instruments. */
export interface PriceFormat {
  /** Smallest price increment, in raw units. */
  tick_size: number
  /** Decimals to show when rendering a price. */
  price_decimals: number
}

/** A raw int64 value. Use bigint when a value may exceed 2^53. */
export type Int = number | bigint

// ---------------------------------------------------------------- internals

const MAX_DECIMALS = 18

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new RangeError(`decimals must be an integer in 0..${MAX_DECIMALS}, got ${decimals}`)
  }
}

function assertTickSize(tick: number): void {
  if (!Number.isInteger(tick) || tick <= 0) {
    throw new RangeError(`tick_size must be a positive integer, got ${tick}`)
  }
}

/** number | bigint -> bigint, or null when not a finite number. Fractions round to nearest. */
function toBig(value: Int): bigint | null {
  if (typeof value === 'bigint') return value
  if (!Number.isFinite(value)) return null
  return BigInt(Math.round(value))
}

/** en-IN digit grouping of a string of digits: 1234567 -> "12,34,567". */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits
  const last3 = digits.slice(-3)
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${rest},${last3}`
}

interface Parts {
  negative: boolean
  int: string
  frac: string
}

/** Split raw / 10^decimals into sign, integer digits and fraction digits — exactly. */
function split(raw: bigint, decimals: number): Parts {
  const negative = raw < 0n
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, '0')
  const cut = digits.length - decimals
  return { negative, int: digits.slice(0, cut), frac: digits.slice(cut) }
}

function body(p: Parts, group: boolean): string {
  const int = group ? groupIndian(p.int) : p.int
  return p.frac ? `${int}.${p.frac}` : int
}

function directionOf(raw: bigint): Direction {
  return raw > 0n ? 'up' : raw < 0n ? 'down' : 'flat'
}

function signPrefix(raw: bigint): string {
  return raw > 0n ? '+' : raw < 0n ? MINUS : ''
}

// ---------------------------------------------------------------- prices

export interface PriceOptions {
  /** en-IN digit grouping. Default false (prices are shown ungrouped, e.g. chart axes, inputs). */
  group?: boolean
}

/** Price as text: formatPrice(10050, {tick_size:5, price_decimals:2}) -> "100.50". */
export function formatPrice(value: Int, fmt: PriceFormat, opts: PriceOptions = {}): string {
  assertDecimals(fmt.price_decimals)
  const raw = toBig(value)
  if (raw === null) return PLACEHOLDER
  const p = split(raw, fmt.price_decimals)
  return (p.negative ? MINUS : '') + body(p, opts.group ?? false)
}

/** Price difference with an explicit sign: "+0.25", "−1.10", "0.00". */
export function formatSignedPrice(value: Int, fmt: PriceFormat, opts: PriceOptions = {}): string {
  return priceChange(value, fmt, opts).text
}

/** Price difference + its direction, for the ▲/▼ + colour component. */
export function priceChange(value: Int, fmt: PriceFormat, opts: PriceOptions = {}): Change {
  assertDecimals(fmt.price_decimals)
  const raw = toBig(value)
  if (raw === null) return { text: PLACEHOLDER, direction: 'flat' }
  const p = split(raw, fmt.price_decimals)
  return { text: signPrefix(raw) + body(p, opts.group ?? false), direction: directionOf(raw) }
}

// ---------------------------------------------------------------- money / P&L

export interface MoneyOptions {
  /** Decimals of the raw value. Default MONEY_DECIMALS. */
  decimals?: number
  /** Append the "units" label. Default true. Set false for table cells whose header says units. */
  label?: boolean
}

function withLabel(text: string, label: boolean): string {
  return label ? `${text} ${UNITS_LABEL}` : text
}

/** Money as text, en-IN grouped, "units" label: 12345678 -> "1,23,456.78 units". Negatives get "−". */
export function formatMoney(value: Int, opts: MoneyOptions = {}): string {
  const decimals = opts.decimals ?? MONEY_DECIMALS
  assertDecimals(decimals)
  const raw = toBig(value)
  if (raw === null) return PLACEHOLDER
  const p = split(raw, decimals)
  return withLabel((p.negative ? MINUS : '') + body(p, true), opts.label ?? true)
}

/** Money with an explicit sign for P&L: "+4,188.00 units", "−312.00 units", "0.00 units". */
export function formatSignedMoney(value: Int, opts: MoneyOptions = {}): string {
  return moneyChange(value, opts).text
}

/** Signed money + direction. Zero is flat and carries no sign. */
export function moneyChange(value: Int, opts: MoneyOptions = {}): Change {
  const decimals = opts.decimals ?? MONEY_DECIMALS
  assertDecimals(decimals)
  const raw = toBig(value)
  if (raw === null) return { text: PLACEHOLDER, direction: 'flat' }
  const p = split(raw, decimals)
  return {
    text: withLabel(signPrefix(raw) + body(p, true), opts.label ?? true),
    direction: directionOf(raw),
  }
}

// ---------------------------------------------------------------- percent

export interface PercentOptions {
  /** Decimals to show. Default 2. */
  decimals?: number
}

/**
 * Percent (the one float on the wire, e.g. change_pct) with an explicit sign: "+1.37%".
 * Direction follows the ROUNDED value, so 0.001 -> "0.00%" / flat, never "+0.00%" with an ▲.
 */
export function percentChange(pct: number, opts: PercentOptions = {}): Change {
  const decimals = opts.decimals ?? 2
  assertDecimals(decimals)
  if (!Number.isFinite(pct)) return { text: PLACEHOLDER, direction: 'flat' }
  const fixed = Math.abs(pct).toFixed(decimals)
  const isZero = Number(fixed) === 0
  if (isZero) return { text: `${fixed}%`, direction: 'flat' }
  return pct > 0 ? { text: `+${fixed}%`, direction: 'up' } : { text: `${MINUS}${fixed}%`, direction: 'down' }
}

export function formatPercent(pct: number, opts: PercentOptions = {}): string {
  return percentChange(pct, opts).text
}

// ---------------------------------------------------------------- quantities

/** Integer quantity, en-IN grouped: 1234567 -> "12,34,567"; negative (short) -> "−100". */
export function formatQty(value: Int): string {
  const raw = toBig(value)
  if (raw === null) return PLACEHOLDER
  const p = split(raw, 0)
  return (p.negative ? MINUS : '') + groupIndian(p.int)
}

// ---------------------------------------------------------------- tick grid + input

/** True when `value` sits on the instrument's tick grid. */
export function isTickAligned(value: Int, tickSize: number): boolean {
  assertTickSize(tickSize)
  const raw = toBig(value)
  return raw !== null && raw % BigInt(tickSize) === 0n
}

export type SnapMode = 'nearest' | 'down' | 'up'

/** bigint -> number, or null when it would lose precision (> 2^53). */
function toSafeNumber(v: bigint): number | null {
  return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : null
}

function snapBig(raw: bigint, t: bigint, mode: SnapMode): bigint {
  const down = raw - (((raw % t) + t) % t) // floor to a multiple of t, correct for negatives
  if (down === raw || mode === 'down') return down
  if (mode === 'up') return down + t
  return (raw - down) * 2n >= t ? down + t : down // nearest, half rounds up
}

/** Snap a raw price to the tick grid. Null for non-finite or beyond-safe-range input. */
export function snapToTick(value: Int, tickSize: number, mode: SnapMode = 'nearest'): number | null {
  assertTickSize(tickSize)
  const raw = toBig(value)
  return raw === null ? null : toSafeNumber(snapBig(raw, BigInt(tickSize), mode))
}

/** One ± step for the limit-price input: the next price on the grid in `direction`. */
export function stepPrice(value: Int, tickSize: number, direction: 1 | -1): number | null {
  assertTickSize(tickSize)
  const raw = toBig(value)
  if (raw === null) return null
  const t = BigInt(tickSize)
  return toSafeNumber(direction === 1 ? snapBig(raw, t, 'down') + t : snapBig(raw, t, 'up') - t)
}

/**
 * Parse user-typed price text into a raw int — the inverse of formatPrice. Accepts digits,
 * one "." and grouping commas/spaces. Returns null (never rounds) for empty, negative,
 * non-numeric input, more fractional digits than price_decimals allow, or a value beyond
 * the safe-integer range. Tick alignment is a separate check (isTickAligned).
 */
export function parsePrice(text: string, fmt: PriceFormat): number | null {
  assertDecimals(fmt.price_decimals)
  const cleaned = text.replace(/[,\s]/g, '')
  const m = /^(\d+)(?:\.(\d*))?$/.exec(cleaned)
  if (!m) return null
  const frac = m[2] ?? ''
  if (frac.length > fmt.price_decimals) return null
  return toSafeNumber(BigInt(m[1] + frac.padEnd(fmt.price_decimals, '0')))
}
