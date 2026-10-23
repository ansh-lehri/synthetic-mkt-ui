// Market-data state (Zustand): everything the WebSocket pushes. Account/order state does NOT
// live here — that is HTTP-polled via TanStack Query.
import { create } from 'zustand'
import type { ServerMessage, SnapshotData, Sub, Timeframe, WsBar } from '@contract/ws'
import { wsBase } from '../api'
import { MarketSocket, type SocketStatus } from './ws'

export interface MarketState {
  status: SocketStatus
  /** Increments on every `connected` frame (first connect and every reconnect). */
  epoch: number
  market: string | null
  /** IANA tz that every naive-local timestamp on the socket is in. */
  timezone: string | null
  /** Latest snapshot per instrument. Latest-wins: a dropped one is harmless. */
  snapshots: Record<string, SnapshotData>
  /** Latest FINALIZED bar pushed per `instrument|timeframe`, with a sequence number. */
  bars: Record<string, { bar: WsBar; seq: number }>
  /** Ack errors by subscription key (e.g. "unknown instrument"). */
  ackErrors: Record<string, string>
  seq: number
  /**
   * The session_id the socket is scoped to. The real backend's `GET /v1/ws` requires one —
   * there is NO anonymous market-data feed (a real-backend shape change from the old mock-era
   * contract, BACKEND-INTEGRATION-PLAN.md). null = no session, no connection at all: nothing
   * subscribes, status stays 'idle'.
   */
  sessionId: string | null
}

export const initialMarketState: MarketState = {
  status: 'idle',
  epoch: 0,
  market: null,
  timezone: null,
  snapshots: {},
  bars: {},
  ackErrors: {},
  seq: 0,
  sessionId: null,
}

export function barKey(instrument: string, timeframe: string): string {
  return `${instrument}|${timeframe}`
}

/** Pure reducer: how one server frame changes the state. Returns the changed fields. */
export function reduceMessage(state: MarketState, msg: ServerMessage): Partial<MarketState> {
  switch (msg.type) {
    case 'snapshot':
      return { snapshots: { ...state.snapshots, [msg.instrument]: msg.data } }
    case 'candle': {
      const seq = state.seq + 1
      return { seq, bars: { ...state.bars, [barKey(msg.instrument, msg.timeframe)]: { bar: msg.bar, seq } } }
    }
    case 'ack': {
      const errors = { ...state.ackErrors }
      for (const r of msg.results) {
        const k = r.stream === 'candle' ? `candle|${r.instrument}|${r.timeframe ?? ''}` : `snapshot|${r.instrument}`
        if (r.status === 'error') errors[k] = r.error
        else delete errors[k]
      }
      return { ackErrors: errors }
    }
    default:
      return {} // `connected` is handled by the socket
  }
}

export const useMarketStore = create<MarketState>(() => ({ ...initialMarketState }))

let socket: MarketSocket | null = null

function wsUrl(sessionId: string): string {
  return `${wsBase()}/v1/ws?session=${encodeURIComponent(sessionId)}`
}

/** Creates the socket on first use, or retargets it (keeping all wanted subscriptions) if the
 * session_id changed since the last call. */
function ensureSocket(sessionId: string): MarketSocket {
  const url = wsUrl(sessionId)
  if (!socket) {
    socket = new MarketSocket({
      url,
      handlers: {
        onStatus: (status) => useMarketStore.setState({ status }),
        onConnected: ({ market, timezone }) =>
          useMarketStore.setState((s) => ({ market, timezone, epoch: s.epoch + 1 })),
        onMessage: (msg) => useMarketStore.setState((s) => reduceMessage(s, msg)),
      },
    })
  } else {
    socket.setUrl(url)
  }
  return socket
}

/**
 * Called once (by the Terminal) whenever the active session changes — on join, exit, or
 * switch. No session -> no connection: the real backend's `/v1/ws` has nothing to serve
 * without one, so the socket is torn down entirely rather than looping on reconnect.
 */
export function setMarketSession(sessionId: string | null): void {
  if (useMarketStore.getState().sessionId === sessionId) return
  if (!sessionId) {
    socket?.stop()
    socket = null
    useMarketStore.setState({ ...initialMarketState, sessionId: null })
    return
  }
  useMarketStore.setState({ sessionId })
  if (socket) ensureSocket(sessionId) // reconnect any already-wanted subs under the new session
}

/** Subscribe to streams for as long as the caller wants them; returns the release function.
 * A no-op release when there is no session yet — callers (useSubscriptions) re-run once
 * `sessionId` changes, so this is retried automatically. */
export function retainSubscriptions(subs: Sub[]): () => void {
  const sessionId = useMarketStore.getState().sessionId
  if (!sessionId) return () => {}
  return ensureSocket(sessionId).retain(subs)
}

export type { SnapshotData, Timeframe, WsBar }
