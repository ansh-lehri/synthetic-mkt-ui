package market

import (
	"hash/fnv"
	"math"
	"strconv"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
)

// StepSeconds is the price process's time resolution (simulated seconds). At the default
// 60x speed one step is half a real second, which is also the snapshot cadence.
const StepSeconds = 30

// BookLevels is how many levels per side the mock publishes (the wire allows up to 10).
const BookLevels = 10

func h(parts ...string) uint64 {
	f := fnv.New64a()
	for _, p := range parts {
		_, _ = f.Write([]byte(p))
		_, _ = f.Write([]byte{0})
	}
	return f.Sum64()
}

func hk(sym string, salt string, k int64) uint64 { return h(sym, salt, strconv.FormatInt(k, 10)) }

// StepIndex is the price-step number of a naive-local time.
func StepIndex(t time.Time) int64 { return t.Unix() / StepSeconds }

// price is the instrument's price at a step: a slow trend, a faster swing and per-step
// jitter, snapped to the tick grid. A function of time only, so history is reproducible.
// This is a toy process for a believable chart, not a market model.
func price(inst catalog.Instrument, k int64) int64 {
	phi1 := float64(h(inst.Symbol, "p1")%628) / 100
	phi2 := float64(h(inst.Symbol, "p2")%628) / 100
	x := 40*math.Sin(2*math.Pi*float64(k)/1500+phi1) +
		14*math.Sin(2*math.Pi*float64(k)/130+phi2) +
		float64(int64(hk(inst.Symbol, "j", k)%7)-3)
	return inst.RefPrice + int64(math.Round(x))*inst.TickSize
}

// stepVolume is the traded volume attributed to one step.
func stepVolume(inst catalog.Instrument, k int64) int64 {
	return int64(20+hk(inst.Symbol, "v", k)%180) * inst.LotSize
}

// LastPrice is the instrument's last traded price at a reading, and whether there is one to
// show. Before the open the last price is the previous close; after the close, the final one.
func LastPrice(inst catalog.Instrument, r Reading) int64 {
	switch r.Phase {
	case PhasePreopen:
		prevClose := Close(r.Day.AddDate(0, 0, -1))
		return price(inst, StepIndex(prevClose)-1)
	case PhaseClosed:
		return price(inst, StepIndex(Close(r.Day))-1)
	default:
		return price(inst, StepIndex(r.Local))
	}
}

// SessionOpenPrice is the reference for change_pct: the price at the day's open.
func SessionOpenPrice(inst catalog.Instrument, r Reading) int64 {
	return price(inst, StepIndex(Open(r.Day)))
}

// ChangePct is (last - session_open) / session_open * 100. It is 0 before the open (there is
// no session open yet).
func ChangePct(inst catalog.Instrument, r Reading) float64 {
	if r.Phase == PhasePreopen {
		return 0
	}
	open := SessionOpenPrice(inst, r)
	return round2(float64(LastPrice(inst, r)-open) / float64(open) * 100)
}

func round2(f float64) float64 { return math.Round(f*100) / 100 }

// WirePhase maps the mock's internal 4-phase clock (PhasePreopen/Open/Closing/Closed —
// used for the book/trading-availability simulation) onto the real backend's WS wire
// vocabulary (unknown/open/auction/closed). The real exchange has no distinct
// "preopen" state at all (confirmed: exchange/clock.Phase has only Closed/Continuous/
// ClosingAuction) — the mock's preopen period reports "unknown" on the wire, same as
// the real backend's own unmapped/default value; "closing" maps to "auction".
func WirePhase(internal string) string {
	switch internal {
	case PhaseOpen:
		return "open"
	case PhaseClosing:
		return "auction"
	case PhaseClosed:
		return "closed"
	default:
		return "unknown"
	}
}

// Snapshot builds the whole picture the socket pushes. The book only exists while trading:
// in preopen and after the close there is a last price but NO bid/ask (has_* false, empty
// depth), which is what a real client must cope with. Book quantities re-roll every step,
// so the ladder moves on every push.
func Snapshot(inst catalog.Instrument, r Reading) api.WsSnapshot {
	last := LastPrice(inst, r)
	snap := api.WsSnapshot{
		Type:       api.WsTypeSnapshot,
		Instrument: inst.Symbol,
		Data: api.WsSnapshotData{
			Phase:     WirePhase(r.Phase),
			LastPrice: last,
			HasLast:   true,
			ChangePct: ChangePct(inst, r),
			Depth:     api.WsDepth{Bids: []api.WsDepthLevel{}, Asks: []api.WsDepthLevel{}},
		},
	}
	if !Trading(r.Phase) {
		return snap
	}
	k := StepIndex(r.Local)
	half := inst.TickSize * int64(1+hk(inst.Symbol, "sp", k)%2) // best bid/ask sit 1 or 2 ticks off last
	bid, ask := last-half, last+half
	for i := int64(0); i < BookLevels; i++ {
		snap.Data.Depth.Bids = append(snap.Data.Depth.Bids, api.WsDepthLevel{
			Price: bid - i*inst.TickSize, Qty: int64(50+hk(inst.Symbol, "b"+strconv.FormatInt(i, 10), k)%850) * inst.LotSize,
		})
		snap.Data.Depth.Asks = append(snap.Data.Depth.Asks, api.WsDepthLevel{
			Price: ask + i*inst.TickSize, Qty: int64(50+hk(inst.Symbol, "a"+strconv.FormatInt(i, 10), k)%850) * inst.LotSize,
		})
	}
	b, a := snap.Data.Depth.Bids[0], snap.Data.Depth.Asks[0]
	snap.Data.Quote = api.WsQuote{
		BestBid: b.Price, BidQty: b.Qty, HasBid: true,
		BestAsk: a.Price, AskQty: a.Qty, HasAsk: true,
	}
	return snap
}
