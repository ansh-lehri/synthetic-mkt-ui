package broker

import (
	"fmt"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
)

// The per-account ledger: the mock's only account state. Deliberately simple — no matching
// against the market and no queue position:
//
//   - a placed limit order rests as "working" and reserves cash (buy) or units (sell);
//   - PartialAfter later an order bigger than one lot is HALF filled (partially_filled);
//     FillAfter later the rest fills and the order leaves the book;
//   - every fill executes at the order's limit price;
//   - a cancel sets cancel_in_flight and lands CancelAfter later (releasing the reserve);
//   - a fill that REDUCES a position closes (part of) a round trip — that is a `Trade` in this
//     contract (entry/exit, gross/costs/net), so trades appear when a position is sold down,
//     not when it is opened. Costs use the same IN rules as the seeded history.
//
// Time is lazy: nothing runs in the background. Every read and write first advances the
// ledger to "now", which keeps the mock deterministic under an injected clock.

// Config tunes the fill simulation; tests inject their own Now and delays.
type Config struct {
	Now          func() time.Time
	PartialAfter time.Duration
	FillAfter    time.Duration
	CancelAfter  time.Duration
}

// DefaultConfig is the real-time setting: half fill after 1s, full fill after 2.5s, cancel
// lands after 0.8s — long enough for a 1s poll loop to show every intermediate state.
func DefaultConfig() Config {
	return Config{Now: time.Now, PartialAfter: time.Second, FillAfter: 2500 * time.Millisecond, CancelAfter: 800 * time.Millisecond}
}

type order struct {
	id            string
	instrument    string
	side          string // "buy" | "sell"
	limit         int64
	orig, filled  int64
	reservedCash  int64
	reservedUnits int64
	placedAt      time.Time
	cancelAt      *time.Time
}

type position struct {
	qty, reserved, avg int64
	openedAt           time.Time
}

type ledger struct {
	cfg                          Config
	practice                     bool // a practice ledger: a copy of the stake that never flows back
	available, reserved, settled int64
	bank                         int64
	orders                       []*order
	pos                          map[string]*position
	trades                       []historyItem // session trades, newest first
	tradeSeq                     int
}

func newLedger(cfg Config, now time.Time) *ledger {
	b := sampleBalance()
	return &ledger{
		cfg: cfg, available: b.Available, reserved: 0, settled: b.Available, bank: b.Bank,
		// A seeded holding so Sell works straight away.
		pos: map[string]*position{"ACME": {qty: 10, avg: 10050, openedAt: now.Add(-90 * time.Minute)}},
	}
}

// advance runs everything due by `now`: cancels landing, then partial and full fills.
func (l *ledger) advance(now time.Time) {
	kept := l.orders[:0]
	for _, o := range l.orders {
		if o.cancelAt != nil {
			if !now.Before(*o.cancelAt) {
				l.release(o)
				continue
			}
			kept = append(kept, o) // cancel still in flight: no more fills
			continue
		}
		age := now.Sub(o.placedAt)
		lot := int64(1)
		if in, ok := catalog.Lookup(o.instrument); ok {
			lot = in.LotSize
		}
		target := o.filled
		switch {
		case age >= l.cfg.FillAfter:
			target = o.orig
		case age >= l.cfg.PartialAfter && o.orig > lot:
			target = o.orig / 2 / lot * lot
		}
		if target > o.filled {
			l.fill(o, target-o.filled, now)
		}
		if o.filled < o.orig {
			kept = append(kept, o)
		}
	}
	l.orders = kept
}

// release returns an order's reserve to the account (cancel, or the cancel leg of a modify).
func (l *ledger) release(o *order) {
	if o.side == "buy" {
		l.reserved -= o.reservedCash
		l.available += o.reservedCash
		o.reservedCash = 0
		return
	}
	if p := l.pos[o.instrument]; p != nil {
		p.reserved -= o.reservedUnits
	}
	o.reservedUnits = 0
}

// fill executes qty of o at its limit price.
func (l *ledger) fill(o *order, qty int64, at time.Time) {
	px := o.limit
	o.filled += qty
	p := l.pos[o.instrument]
	if p == nil {
		p = &position{}
		l.pos[o.instrument] = p
	}
	if o.side == "buy" {
		cash := qty * px
		o.reservedCash -= cash
		l.reserved -= cash
		l.settled -= cash
		if p.qty == 0 {
			p.openedAt = at
		}
		total := p.qty + qty
		p.avg = (p.qty*p.avg + qty*px + total/2) / total // weighted average, rounded to nearest
		p.qty = total
		return
	}
	// sell: close (part of) a long round trip at the position's weighted average entry
	o.reservedUnits -= qty
	p.reserved -= qty
	proceeds := qty * px
	entry := p.avg
	gross := (px - entry) * qty
	lines := costLines(qty, entry, px, false)
	var costs int64
	for _, c := range lines {
		costs += c.Amount
	}
	net := gross - costs
	l.available += proceeds - costs
	l.settled += proceeds - costs
	l.tradeSeq++
	id := fmt.Sprintf("s-%04d", l.tradeSeq)
	t := api.Trade{
		TradeId: id, Instrument: o.instrument, Direction: api.Long, Quantity: qty,
		EntryPrice: entry, ExitPrice: px, EntryAt: p.openedAt, ExitAt: at,
		GrossPnl: gross, TotalCosts: costs, NetPnl: net,
		PnlPct: float32(round2(float64(net) / float64(entry*qty) * 100)), ExitReason: "manual",
	}
	l.trades = append([]historyItem{{trade: t, costs: api.CostsTrade{TradeId: id, Lines: nonNilLines(lines), Total: costs}}}, l.trades...)
	p.qty -= qty
	if p.qty == 0 {
		p.avg = 0
		p.openedAt = time.Time{}
	}
}

// rest validates a limit order against the account, reserves for it and puts it on the book.
// reason is the contract's 422 tag when it refuses.
func (l *ledger) rest(id, instrument, side string, qty, limit int64, now time.Time) (reason string) {
	in, ok := catalog.Lookup(instrument)
	switch {
	case !ok:
		return "unknown_instrument"
	case side != "buy" && side != "sell":
		return "bad_side"
	case qty <= 0 || qty%in.LotSize != 0:
		return "bad_qty"
	case limit <= 0 || limit%in.TickSize != 0:
		return "bad_price"
	}
	o := &order{id: id, instrument: instrument, side: side, limit: limit, orig: qty, placedAt: now}
	if side == "buy" {
		cost := qty * limit
		if cost > l.available {
			return "insufficient_funds"
		}
		l.available -= cost
		l.reserved += cost
		o.reservedCash = cost
	} else {
		p := l.pos[instrument]
		if p == nil || qty > p.qty-p.reserved { // no shorting in the mock
			return "insufficient_funds"
		}
		p.reserved += qty
		o.reservedUnits = qty
	}
	l.orders = append(l.orders, o)
	return ""
}

func (l *ledger) find(id string) *order {
	for _, o := range l.orders {
		if o.id == id {
			return o
		}
	}
	return nil
}

// cancel starts a cancel (it lands CancelAfter later). reason is the contract's 409 tag.
func (l *ledger) cancel(id string, now time.Time) (reason string) {
	o := l.find(id)
	if o == nil {
		return "unknown_order"
	}
	if o.cancelAt != nil {
		return "not_cancellable"
	}
	at := now.Add(l.cfg.CancelAfter)
	o.cancelAt = &at
	return ""
}

// cancelNow removes an order immediately (the cancel leg of a modify).
func (l *ledger) cancelNow(id string) (reason string) {
	o := l.find(id)
	if o == nil {
		return "unknown_order"
	}
	if o.cancelAt != nil {
		return "not_cancellable"
	}
	l.release(o)
	for i, x := range l.orders {
		if x == o {
			l.orders = append(l.orders[:i], l.orders[i+1:]...)
			break
		}
	}
	return ""
}

// transfer moves money between the trading balance and the bank. reason is a human message
// when it refuses (the contract answers 422 {"error"}).
func (l *ledger) transfer(toBank bool, amount int64) (reason string) {
	if toBank {
		if amount > l.available {
			return "insufficient trading balance"
		}
		l.available -= amount
		l.settled -= amount
		l.bank += amount
		return ""
	}
	if amount > l.bank {
		return "insufficient bank balance"
	}
	l.available += amount
	l.settled += amount
	l.bank -= amount
	return ""
}

// ---- contract views

func (l *ledger) balance() api.Balance {
	return api.Balance{Available: l.available, Reserved: l.reserved, Settled: l.settled, Bank: l.bank}
}

// positions lists non-flat holdings only. mark_available is false (Phase 7): ltp and
// gross_unrealized are 0; qty and weighted_avg_entry are real.
func (l *ledger) positions() []api.Position {
	out := []api.Position{}
	for _, sym := range []string{"ACME", "BETA"} {
		if p := l.pos[sym]; p != nil && p.qty != 0 {
			out = append(out, api.Position{Instrument: sym, Qty: p.qty, ReservedQty: p.reserved, WeightedAvgEntry: p.avg})
		}
	}
	return out
}

func (l *ledger) openOrders() []api.OpenOrder {
	out := make([]api.OpenOrder, 0, len(l.orders))
	for _, o := range l.orders {
		side := api.OpenOrderSideBuy
		if o.side == "sell" {
			side = api.OpenOrderSideSell
		}
		status := api.Working
		if o.filled > 0 {
			status = api.PartiallyFilled
		}
		out = append(out, api.OpenOrder{
			OrderId: o.id, Instrument: o.instrument, Side: side, IsMarket: false, LimitPrice: o.limit,
			OrigQty: o.orig, RemainingQty: o.orig - o.filled, FilledQty: o.filled,
			ReservedCash: o.reservedCash, ReservedUnits: o.reservedUnits, Status: status, CancelInFlight: o.cancelAt != nil,
		})
	}
	return out
}
