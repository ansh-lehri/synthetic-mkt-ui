/**
 * WebSocket wire types — HAND-AUTHORED from contract/ws-schemas.md.
 *
 * OpenAPI can't describe WS frames, so this file is not generated. It is committed
 * and must be kept in sync with ws-schemas.md by hand (small, stable set). If a frame
 * shape changes: edit ws-schemas.md, this file, and the mock's /ws in the same change.
 *
 * Conventions (same as the HTTP side): every price/qty is a bare int64 (a JS number),
 * timestamps are naive-local ISO-8601 in the market tz from the `connected` frame,
 * `change_pct` is the only float, and `has_*` flags are load-bearing — never render an
 * optional numeric without checking its flag.
 */

import type { components } from "./api";

type Schemas = components["schemas"];

/** 1m / 5m / 30m / 60m — the same allowlist as GET /v1/candles. */
export type Timeframe = Schemas["CandleResponse"]["timeframe"];

/** Session state: preopen → open → closing → closed. Same enum as the REST side. */
export type Phase = Schemas["ActiveSession"]["phase"];

/** A finalized bar — identical shape to the REST `Bar`. */
export type WsBar = Schemas["Bar"];

// ----------------------------------------------------------------------------
// Client → server
// ----------------------------------------------------------------------------

export type CandleSub = { stream: "candle"; instrument: string; timeframe: Timeframe };
export type SnapshotSub = { stream: "snapshot"; instrument: string };
export type Sub = CandleSub | SnapshotSub;

/** Batched subscribe. An accepted snapshot sub is followed immediately by a seed snapshot. */
export type SubscribeMessage = { type: "subscribe"; subs: Sub[] };

/** Same `subs` shape. Switching instrument/timeframe = unsubscribe old + subscribe new. */
export type UnsubscribeMessage = { type: "unsubscribe"; subs: Sub[] };

export type ClientMessage = SubscribeMessage | UnsubscribeMessage;

// ----------------------------------------------------------------------------
// Server → client
// ----------------------------------------------------------------------------

/** Sent immediately on connect; establishes the tz for every naive-local timestamp. */
export type ConnectedMessage = { type: "connected"; market: string; timezone: string };

/** Per-sub error reasons the server uses today. */
export type AckError = "unknown instrument" | "bad timeframe" | "bad stream";

export type AckResult =
  | { stream: "candle"; instrument: string; timeframe: string; status: "ok" }
  | { stream: "snapshot"; instrument: string; status: "ok" }
  | {
      stream: string;
      instrument: string;
      timeframe?: string;
      status: "error";
      /** One of AckError; typed as string so a new server reason doesn't break the client. */
      error: string;
    };

export type AckMessage = { type: "ack"; results: AckResult[] };

/** Model A: pushed ONLY when the bar's bucket closes. Live movement is in the snapshot. */
export type CandleMessage = {
  type: "candle";
  instrument: string;
  timeframe: Timeframe;
  bar: WsBar;
};

export type Quote = {
  best_bid: number;
  bid_qty: number;
  /** false → no bid; best_bid is meaningless (0 is a valid price, not "absent"). */
  has_bid: boolean;
  best_ask: number;
  ask_qty: number;
  /** false → no ask; best_ask is meaningless. */
  has_ask: boolean;
};

export type DepthLevel = { price: number; qty: number };

/** Up to top-10 per side, best-first. */
export type Depth = { bids: DepthLevel[]; asks: DepthLevel[] };

export type SnapshotData = {
  /** Session state for the Terminal's session bar (there is no separate session frame). */
  phase: Phase;
  last_price: number;
  /** false → no last trade yet; last_price is meaningless. */
  has_last: boolean;
  /** (last_price − session_open) / session_open × 100. The only float on the wire. */
  change_pct: number;
  quote: Quote;
  depth: Depth;
};

/** Whole picture re-emitted on any change. Latest-wins; a dropped one is harmless. */
export type SnapshotMessage = { type: "snapshot"; instrument: string; data: SnapshotData };

export type ServerMessage = ConnectedMessage | AckMessage | CandleMessage | SnapshotMessage;
