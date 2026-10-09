// WebSocket wire types — HAND-AUTHORED from contract/ws-schemas.md (not generated).
//
// OpenAPI can't describe WS frames. Keep this file, contract/generated/ts/ws.ts and
// ws-schemas.md in sync by hand; change all three (and the mock's /ws) together.
package api

// WS message `type` discriminators.
const (
	WsTypeConnected   = "connected"
	WsTypeSubscribe   = "subscribe"
	WsTypeUnsubscribe = "unsubscribe"
	WsTypeAck         = "ack"
	WsTypeCandle      = "candle"
	WsTypeSnapshot    = "snapshot"
)

// WS stream names and ack statuses.
const (
	WsStreamCandle   = "candle"
	WsStreamSnapshot = "snapshot"
	WsAckOK          = "ok"
	WsAckError       = "error"
)

// Ack error reasons used by the server today.
const (
	WsErrUnknownInstrument = "unknown instrument"
	WsErrBadTimeframe      = "bad timeframe"
	WsErrBadStream         = "bad stream"
)

// WsEnvelope is decoded first to read the `type` discriminator of a client frame.
type WsEnvelope struct {
	Type string `json:"type"`
}

// WsConnected is sent immediately on connect; it names the market tz for naive-local timestamps.
type WsConnected struct {
	Type     string `json:"type"` // always WsTypeConnected
	Market   string `json:"market"`
	Timezone string `json:"timezone"`
}

// WsSub is one subscription. Timeframe is set for the candle stream only.
type WsSub struct {
	Stream     string `json:"stream"`
	Instrument string `json:"instrument"`
	Timeframe  string `json:"timeframe,omitempty"`
}

// WsSubscribe is the batched client -> server subscribe / unsubscribe frame
// (Type is WsTypeSubscribe or WsTypeUnsubscribe).
type WsSubscribe struct {
	Type string  `json:"type"`
	Subs []WsSub `json:"subs"`
}

// WsAckResult is the per-sub status inside an ack.
type WsAckResult struct {
	Stream     string `json:"stream"`
	Instrument string `json:"instrument"`
	Timeframe  string `json:"timeframe,omitempty"`
	Status     string `json:"status"` // WsAckOK | WsAckError
	Error      string `json:"error,omitempty"`
}

// WsAck replies to a subscribe / unsubscribe, one result per sub.
type WsAck struct {
	Type    string        `json:"type"` // always WsTypeAck
	Results []WsAckResult `json:"results"`
}

// WsCandle is pushed only when a bar's bucket closes (Model A).
type WsCandle struct {
	Type       string `json:"type"` // always WsTypeCandle
	Instrument string `json:"instrument"`
	Timeframe  string `json:"timeframe"`
	Bar        Bar    `json:"bar"`
}

// WsQuote: every optional numeric is gated on its has_* flag (0 is a valid price).
type WsQuote struct {
	BestBid int64 `json:"best_bid"`
	BidQty  int64 `json:"bid_qty"`
	HasBid  bool  `json:"has_bid"`
	BestAsk int64 `json:"best_ask"`
	AskQty  int64 `json:"ask_qty"`
	HasAsk  bool  `json:"has_ask"`
}

// WsDepthLevel is one price level of the book.
type WsDepthLevel struct {
	Price int64 `json:"price"`
	Qty   int64 `json:"qty"`
}

// WsDepth carries up to top-10 per side, best-first.
type WsDepth struct {
	Bids []WsDepthLevel `json:"bids"`
	Asks []WsDepthLevel `json:"asks"`
}

// WsSnapshotData is the whole picture, re-emitted on any change (latest-wins).
type WsSnapshotData struct {
	Phase     string  `json:"phase"` // preopen | open | closing | closed
	LastPrice int64   `json:"last_price"`
	HasLast   bool    `json:"has_last"`
	ChangePct float64 `json:"change_pct"` // the only float on the wire
	Quote     WsQuote `json:"quote"`
	Depth     WsDepth `json:"depth"`
}

// WsSnapshot is the snapshot push frame.
type WsSnapshot struct {
	Type       string         `json:"type"` // always WsTypeSnapshot
	Instrument string         `json:"instrument"`
	Data       WsSnapshotData `json:"data"`
}
