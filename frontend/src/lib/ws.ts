// Market-data WebSocket client (market-data axis, push). One socket per app, ref-counted
// subscriptions, automatic reconnect with backoff. It is transport only: frames go to the
// handlers, which feed the Zustand store (lib/marketStore.ts). No order stream exists —
// account state is polled over HTTP, never pushed here.
//
// Reconnect = REHYDRATE, not backfill: the server replays nothing. Every `connected` frame
// (first connect or reconnect) re-subscribes everything that is still wanted and bumps an
// epoch; consumers that hold history (the chart) re-fetch it when the epoch changes.
import type { AckResult, ClientMessage, ServerMessage, Sub } from '@contract/ws'

export type SocketStatus = 'idle' | 'connecting' | 'live' | 'reconnecting'

export interface SocketHandlers {
  onStatus: (status: SocketStatus) => void
  /** The `connected` frame: the socket is usable and tells us the market tz. */
  onConnected: (info: { market: string; timezone: string }) => void
  onMessage: (msg: ServerMessage) => void
}

export interface SocketOptions {
  url: string
  handlers: SocketHandlers
  /** Injected in tests. */
  WebSocketImpl?: typeof WebSocket
  /** Reconnect delay bounds, ms. Doubles from min to max. */
  backoff?: { min: number; max: number }
  /** How long to keep the socket open after the last subscription is released (ms). */
  idleGraceMs?: number
}

/** Stable identity of a subscription. */
export function subKey(s: Sub): string {
  return s.stream === 'candle' ? `candle|${s.instrument}|${s.timeframe}` : `snapshot|${s.instrument}`
}

/** Parse a frame defensively: anything that isn't a JSON object with a string `type` is dropped. */
export function parseFrame(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null
  try {
    const v = JSON.parse(raw) as { type?: unknown }
    if (v && typeof v === 'object' && typeof v.type === 'string') return v as ServerMessage
  } catch {
    // not JSON
  }
  return null
}

export class MarketSocket {
  private readonly opts: Required<Omit<SocketOptions, 'WebSocketImpl'>> & { WebSocketImpl: typeof WebSocket }
  private ws: WebSocket | null = null
  private ready = false // `connected` frame received on the current socket
  private wanted = new Map<string, { sub: Sub; refs: number }>()
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryAttempt = 0
  private static readonly maxRetryAttempts = 5

  constructor(options: SocketOptions) {
    this.opts = {
      url: options.url,
      handlers: options.handlers,
      WebSocketImpl: options.WebSocketImpl ?? WebSocket,
      backoff: options.backoff ?? { min: 500, max: 5000 },
      idleGraceMs: options.idleGraceMs ?? 1000,
    }
  }

  /**
   * Ask for subscriptions. Returns a release function. Calls are ref-counted, so two
   * components wanting the same stream share one subscription.
   */
  retain(subs: Sub[]): () => void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    const fresh: Sub[] = []
    for (const sub of subs) {
      const k = subKey(sub)
      const cur = this.wanted.get(k)
      if (cur) cur.refs++
      else {
        this.wanted.set(k, { sub, refs: 1 })
        fresh.push(sub)
      }
    }
    if (!this.running) this.start()
    else if (this.ready && fresh.length) this.send({ type: 'subscribe', subs: fresh })

    let released = false
    return () => {
      if (released) return
      released = true
      const gone: Sub[] = []
      for (const sub of subs) {
        const k = subKey(sub)
        const cur = this.wanted.get(k)
        if (!cur) continue
        if (--cur.refs <= 0) {
          this.wanted.delete(k)
          gone.push(sub)
        }
      }
      if (this.ready && gone.length) this.send({ type: 'unsubscribe', subs: gone })
      if (this.wanted.size === 0) {
        // Debounced so a React remount (StrictMode, tab switch) doesn't tear the socket down.
        this.idleTimer = setTimeout(() => this.stop(), this.opts.idleGraceMs)
      }
    }
  }

  /** Subscriptions currently wanted (for tests/diagnostics). */
  wantedKeys(): string[] {
    return [...this.wanted.keys()].sort()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.connect()
  }

  /**
   * Changes the connect target (e.g. the session_id query param changed because the user
   * joined/exited/switched sessions). A no-op if the URL is unchanged; otherwise forces an
   * immediate reconnect against the new URL, keeping all wanted subscriptions intact.
   */
  setUrl(url: string): void {
    if (url === this.opts.url) return
    this.opts.url = url
    if (!this.running) return
    this.attempt = 0
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.retryAttempt = 0
    const old = this.ws
    this.ws = null
    this.ready = false
    old?.close()
    this.connect()
  }

  /** Forces an immediate reconnect on the same URL — used when the market phase transitions
   * so fresh subscriptions are registered and the epoch bumps. */
  reconnect(): void {
    if (!this.running) return
    this.attempt = 0
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null }
    this.retryAttempt = 0
    const old = this.ws
    this.ws = null
    this.ready = false
    old?.close()
    this.connect()
  }

  stop(): void {
    this.running = false
    this.ready = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.idleTimer) clearTimeout(this.idleTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.reconnectTimer = this.idleTimer = this.retryTimer = null
    this.retryAttempt = 0
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.opts.handlers.onStatus('idle')
  }

  private connect(): void {
    if (!this.running) return
    this.opts.handlers.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting')
    const ws = new this.opts.WebSocketImpl(this.opts.url)
    this.ws = ws
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws) return // a stale socket
      const msg = parseFrame(ev.data)
      if (!msg) return
      if (msg.type === 'connected') {
        this.ready = true
        this.attempt = 0
        this.retryAttempt = 0
        this.opts.handlers.onStatus('live')
        this.opts.handlers.onConnected({ market: msg.market, timezone: msg.timezone })
        const all = [...this.wanted.values()].map((w) => w.sub)
        if (all.length) this.send({ type: 'subscribe', subs: all })
        return
      }
      this.opts.handlers.onMessage(msg)
      if (msg.type === 'ack') this.scheduleRetryForUnknown(msg.results)
    }
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      this.ready = false
      if (!this.running) return
      this.opts.handlers.onStatus('reconnecting')
      const { min, max } = this.opts.backoff
      const delay = Math.min(max, min * 2 ** this.attempt)
      this.attempt++
      this.reconnectTimer = setTimeout(() => this.connect(), delay)
    }
    ws.onerror = () => {
      // A close always follows an error; reconnect is scheduled there.
    }
  }

  // When the server nacks a sub with "unknown instrument" the exchange hasn't emitted
  // its first tape event for that instrument yet (a startup race at on-demand session
  // creation). Retry every 2 s, up to maxRetryAttempts times, stopping as soon as the
  // ack comes back clean. retryAttempt resets to 0 on every `connected` frame so a
  // fresh connection gets its own full budget.
  private scheduleRetryForUnknown(results: AckResult[]): void {
    const retryable: Sub[] = []
    for (const r of results) {
      if (r.status !== 'error' || r.error !== 'unknown instrument') continue
      const k = r.stream === 'candle'
        ? `candle|${r.instrument}|${r.timeframe ?? ''}`
        : `snapshot|${r.instrument}`
      const entry = this.wanted.get(k)
      if (entry) retryable.push(entry.sub)
    }
    if (retryable.length === 0) return
    if (this.retryAttempt >= MarketSocket.maxRetryAttempts) return
    if (this.retryTimer) return // already scheduled
    this.retryAttempt++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.ready) this.send({ type: 'subscribe', subs: retryable })
    }, 2000)
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === 1 /* OPEN */) this.ws.send(JSON.stringify(msg))
  }
}
