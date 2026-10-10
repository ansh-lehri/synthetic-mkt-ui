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

function getSocket(): MarketSocket {
  if (!socket) {
    socket = new MarketSocket({
      url: wsBase(),
      handlers: {
        onStatus: (status) => useMarketStore.setState({ status }),
        onConnected: ({ market, timezone }) =>
          useMarketStore.setState((s) => ({ market, timezone, epoch: s.epoch + 1 })),
        onMessage: (msg) => useMarketStore.setState((s) => reduceMessage(s, msg)),
      },
    })
  }
  return socket
}

/** Subscribe to streams for as long as the caller wants them; returns the release function. */
export function retainSubscriptions(subs: Sub[]): () => void {
  return getSocket().retain(subs)
}

export type { SnapshotData, Timeframe, WsBar }
