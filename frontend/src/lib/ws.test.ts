import { describe, expect, it, vi } from 'vitest'
import { MarketSocket, parseFrame, subKey, type SocketStatus } from './ws'
import { initialMarketState, reduceMessage } from './marketStore'
import type { ServerMessage } from '@contract/ws'

// A hand-driven WebSocket double.
class FakeWS {
  static instances: FakeWS[] = []
  readyState = 0
  sent: unknown[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeWS.instances.push(this)
  }
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
  // test helpers
  open() {
    this.readyState = 1
  }
  push(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
  drop() {
    this.readyState = 3
    this.onclose?.()
  }
}

function setup() {
  FakeWS.instances = []
  const statuses: SocketStatus[] = []
  const connected: Array<{ market: string; timezone: string }> = []
  const messages: ServerMessage[] = []
  const s = new MarketSocket({
    url: 'ws://x/ws',
    WebSocketImpl: FakeWS as unknown as typeof WebSocket,
    backoff: { min: 100, max: 400 },
    idleGraceMs: 50,
    handlers: {
      onStatus: (x) => statuses.push(x),
      onConnected: (i) => connected.push(i),
      onMessage: (m) => messages.push(m),
    },
  })
  const cur = () => FakeWS.instances[FakeWS.instances.length - 1]
  const hello = () => {
    cur().open()
    cur().push({ type: 'connected', market: 'IN', timezone: 'Asia/Kolkata' })
  }
  return { s, statuses, connected, messages, cur, hello }
}

describe('parseFrame', () => {
  it('accepts a typed JSON object and drops everything else', () => {
    expect(parseFrame('{"type":"ack","results":[]}')).toEqual({ type: 'ack', results: [] })
    expect(parseFrame('not json')).toBeNull()
    expect(parseFrame('{"nope":1}')).toBeNull()
    expect(parseFrame('42')).toBeNull()
    expect(parseFrame(new ArrayBuffer(2))).toBeNull()
  })
})

describe('MarketSocket', () => {
  it('subscribes only after `connected`, batching everything wanted', () => {
    const { s, cur, hello, connected, statuses } = setup()
    s.retain([{ stream: 'snapshot', instrument: 'ACME' }, { stream: 'candle', instrument: 'ACME', timeframe: '5m' }])
    expect(cur().sent).toEqual([]) // nothing is sent before the server says hello
    hello()
    expect(connected).toEqual([{ market: 'IN', timezone: 'Asia/Kolkata' }])
    expect(statuses).toEqual(['connecting', 'live'])
    expect(cur().sent).toEqual([
      { type: 'subscribe', subs: [{ stream: 'snapshot', instrument: 'ACME' }, { stream: 'candle', instrument: 'ACME', timeframe: '5m' }] },
    ])
  })

  it('sends only the NEW subs once live, and ref-counts shared ones', () => {
    const { s, cur, hello } = setup()
    const r1 = s.retain([{ stream: 'snapshot', instrument: 'ACME' }])
    hello()
    cur().sent.length = 0
    const r2 = s.retain([{ stream: 'snapshot', instrument: 'ACME' }, { stream: 'snapshot', instrument: 'BETA' }])
    expect(cur().sent).toEqual([{ type: 'subscribe', subs: [{ stream: 'snapshot', instrument: 'BETA' }] }])
    cur().sent.length = 0
    r1() // ACME is still held by r2: no unsubscribe
    expect(cur().sent).toEqual([])
    r2()
    expect(cur().sent).toEqual([{ type: 'unsubscribe', subs: [{ stream: 'snapshot', instrument: 'ACME' }, { stream: 'snapshot', instrument: 'BETA' }] }])
    r2() // releasing twice is harmless
  })

  it('reconnects with backoff and RE-SUBSCRIBES everything (rehydrate, not backfill)', () => {
    vi.useFakeTimers()
    try {
      const { s, cur, hello, connected, statuses } = setup()
      s.retain([{ stream: 'snapshot', instrument: 'ACME' }])
      hello()
      const first = cur()
      first.drop()
      expect(statuses.at(-1)).toBe('reconnecting')
      expect(FakeWS.instances).toHaveLength(1)
      vi.advanceTimersByTime(100) // first backoff
      expect(FakeWS.instances).toHaveLength(2)
      cur().drop() // fails again -> doubled delay
      vi.advanceTimersByTime(150)
      expect(FakeWS.instances).toHaveLength(2)
      vi.advanceTimersByTime(60)
      expect(FakeWS.instances).toHaveLength(3)
      hello()
      expect(connected).toHaveLength(2) // two `connected` frames -> the epoch advances twice
      expect(cur().sent).toEqual([{ type: 'subscribe', subs: [{ stream: 'snapshot', instrument: 'ACME' }] }])
      expect(statuses.at(-1)).toBe('live')
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes after the last release (debounced) and does not reconnect', () => {
    vi.useFakeTimers()
    try {
      const { s, cur, hello, statuses } = setup()
      const release = s.retain([{ stream: 'snapshot', instrument: 'ACME' }])
      hello()
      release()
      vi.advanceTimersByTime(60)
      expect(statuses.at(-1)).toBe('idle')
      vi.advanceTimersByTime(10_000)
      expect(FakeWS.instances).toHaveLength(1)
      expect(cur().readyState).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a quick re-retain cancels the idle close (React remount)', () => {
    vi.useFakeTimers()
    try {
      const { s, hello, statuses } = setup()
      const r = s.retain([{ stream: 'snapshot', instrument: 'ACME' }])
      hello()
      r()
      s.retain([{ stream: 'snapshot', instrument: 'ACME' }])
      vi.advanceTimersByTime(500)
      expect(statuses).not.toContain('idle')
      expect(FakeWS.instances).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('forwards non-connected frames and ignores junk and stale sockets', () => {
    vi.useFakeTimers()
    try {
      const { s, cur, hello, messages } = setup()
      s.retain([{ stream: 'snapshot', instrument: 'ACME' }])
      hello()
      const first = cur()
      first.push({ type: 'ack', results: [] })
      first.onmessage?.({ data: 'garbage' })
      expect(messages).toEqual([{ type: 'ack', results: [] }])
      first.drop()
      vi.advanceTimersByTime(100)
      first.push({ type: 'ack', results: [] }) // late frame from the dead socket
      expect(messages).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('subKey distinguishes timeframes', () => {
    expect(subKey({ stream: 'candle', instrument: 'A', timeframe: '1m' })).not.toBe(subKey({ stream: 'candle', instrument: 'A', timeframe: '5m' }))
  })
})

describe('reduceMessage', () => {
  const snap = {
    type: 'snapshot' as const,
    instrument: 'ACME',
    data: { phase: 'open' as const, last_price: 10090, has_last: true, change_pct: 1.37, quote: { best_bid: 10085, bid_qty: 1, has_bid: true, best_ask: 10095, ask_qty: 1, has_ask: true }, depth: { bids: [], asks: [] } },
  }
  it('snapshots are latest-wins per instrument', () => {
    const a = reduceMessage(initialMarketState, snap)
    const b = reduceMessage({ ...initialMarketState, ...a }, { ...snap, data: { ...snap.data, last_price: 10100 } })
    expect(b.snapshots?.ACME.last_price).toBe(10100)
  })
  it('candles keep the latest finalized bar per instrument+timeframe with a rising seq', () => {
    const bar = { start: '2026-10-09T09:15:00', end: '2026-10-09T09:20:00', open: 1, high: 2, low: 1, close: 2, volume: 3 }
    const a = reduceMessage(initialMarketState, { type: 'candle', instrument: 'ACME', timeframe: '5m', bar })
    const s1 = { ...initialMarketState, ...a }
    const b = reduceMessage(s1, { type: 'candle', instrument: 'ACME', timeframe: '5m', bar: { ...bar, start: bar.end } })
    expect(b.bars?.['ACME|5m'].seq).toBeGreaterThan(a.bars!['ACME|5m'].seq)
    expect(b.bars?.['ACME|5m'].bar.start).toBe(bar.end)
  })
  it('acks record and clear per-sub errors', () => {
    const a = reduceMessage(initialMarketState, { type: 'ack', results: [{ stream: 'snapshot', instrument: 'ZZZZ', status: 'error', error: 'unknown instrument' }] })
    expect(a.ackErrors).toEqual({ 'snapshot|ZZZZ': 'unknown instrument' })
    const b = reduceMessage({ ...initialMarketState, ...a }, { type: 'ack', results: [{ stream: 'snapshot', instrument: 'ZZZZ', status: 'ok' }] })
    expect(b.ackErrors).toEqual({})
  })
})
