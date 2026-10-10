package market

import (
	"testing"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
)

var day0 = time.Date(2026, 10, 12, 0, 0, 0, 0, time.UTC)

func acme(t *testing.T) catalog.Instrument {
	t.Helper()
	i, ok := catalog.Lookup("ACME")
	if !ok {
		t.Fatal("no ACME")
	}
	return i
}

func at(day time.Time, h, m, s int) time.Time {
	return day.Add(time.Duration(h)*time.Hour + time.Duration(m)*time.Minute + time.Duration(s)*time.Second)
}

func TestClockCyclesThroughPhasesThenNextDay(t *testing.T) {
	now := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)
	c := NewClock(60, 30*time.Second, day0, func() time.Time { return now })

	// one simulated minute is one real second at 60x
	step := func(simAt time.Duration) Reading {
		now = time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC).Add(time.Duration(float64(simAt) / 60))
		return c.Read()
	}
	cases := []struct {
		simSinceStart time.Duration // since 09:00
		phase         string
		local         time.Time
	}{
		{0, PhasePreopen, at(day0, 9, 0, 0)},
		{14 * time.Minute, PhasePreopen, at(day0, 9, 14, 0)},
		{15 * time.Minute, PhaseOpen, at(day0, 9, 15, 0)},
		{6 * time.Hour, PhaseOpen, at(day0, 15, 0, 0)},
		{6*time.Hour + 15*time.Minute, PhaseClosing, at(day0, 15, 15, 0)},
		{6*time.Hour + 29*time.Minute, PhaseClosing, at(day0, 15, 29, 0)},
	}
	for _, tc := range cases {
		r := step(tc.simSinceStart)
		if r.Phase != tc.phase || !r.Local.Equal(tc.local) {
			t.Fatalf("at +%v: got %s %v, want %s %v", tc.simSinceStart, r.Phase, r.Local, tc.phase, tc.local)
		}
	}

	// the full simulated day is 6.5h = 390 real seconds; then 30s closed (clock pinned at 15:30)
	now = time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC).Add(395 * time.Second)
	if r := c.Read(); r.Phase != PhaseClosed || !r.Local.Equal(at(day0, 15, 30, 0)) {
		t.Fatalf("hold: %+v", r)
	}
	// ... then the NEXT day starts again at preopen
	now = time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC).Add(421 * time.Second)
	r := c.Read()
	next := day0.AddDate(0, 0, 1)
	if r.Phase != PhasePreopen || !r.Day.Equal(next) {
		t.Fatalf("next day: %+v, want preopen on %v", r, next)
	}
}

func TestPriceIsDeterministicOnTheGridAndMoves(t *testing.T) {
	inst := acme(t)
	seen := map[int64]bool{}
	for k := int64(0); k < 400; k++ {
		p := price(inst, StepIndex(at(day0, 9, 15, 0))+k)
		if p != price(inst, StepIndex(at(day0, 9, 15, 0))+k) {
			t.Fatal("not deterministic")
		}
		if p%inst.TickSize != 0 || p <= 0 {
			t.Fatalf("price %d off the tick grid / non-positive", p)
		}
		seen[p] = true
	}
	if len(seen) < 15 {
		t.Fatalf("price barely moves: %d distinct values over 400 steps", len(seen))
	}
}

func TestBarsAreCoherentAndTile(t *testing.T) {
	inst := acme(t)
	for name, step := range Timeframes {
		bs := DayBuckets(day0, step)
		if !bs[0].Start.Equal(at(day0, 9, 15, 0)) || !bs[len(bs)-1].End.Equal(at(day0, 15, 30, 0)) {
			t.Fatalf("%s: buckets must span 09:15-15:30, got %v..%v", name, bs[0].Start, bs[len(bs)-1].End)
		}
		for i, b := range bs {
			if i > 0 && !b.Start.Equal(bs[i-1].End) {
				t.Fatalf("%s: gap/overlap at %d", name, i)
			}
			bar := BarFor(inst, b)
			if bar.High < bar.Open || bar.High < bar.Close || bar.Low > bar.Open || bar.Low > bar.Close || bar.Volume <= 0 {
				t.Fatalf("%s: incoherent bar %+v", name, bar)
			}
		}
	}
	// 60m: the last bucket is the truncated 15:15-15:30
	bs := DayBuckets(day0, time.Hour)
	if last := bs[len(bs)-1]; !last.Start.Equal(at(day0, 15, 15, 0)) || last.End.Sub(last.Start) != 15*time.Minute {
		t.Fatalf("60m trailing bucket: %+v", last)
	}
	if len(DayBuckets(day0, time.Minute)) != 375 {
		t.Fatal("1m: want 375 bars a day")
	}
}

func TestHistoryOnlyHasFinalizedBars(t *testing.T) {
	now := at(day0, 10, 0, 0)
	got := BucketsInRange(5*time.Minute, at(day0, 9, 15, 0), at(day0, 15, 30, 0), now)
	if len(got) != 9 { // 09:15..10:00 -> nine 5m bars have closed
		t.Fatalf("want 9 finalized bars at 10:00, got %d", len(got))
	}
	if last := got[len(got)-1]; !last.End.Equal(now) {
		t.Fatalf("last finalized bar should end exactly now: %+v", last)
	}
	// a bar that is still in progress is not history
	if n := len(BucketsInRange(5*time.Minute, at(day0, 9, 15, 0), at(day0, 15, 30, 0), at(day0, 10, 2, 59))); n != 9 {
		t.Fatalf("an in-progress bucket must not be included, got %d", n)
	}
	// previous days are fully finalized
	if n := len(BucketsInRange(time.Hour, at(day0.AddDate(0, 0, -1), 9, 15, 0), at(day0.AddDate(0, 0, -1), 15, 30, 0), now)); n != 7 {
		t.Fatalf("a past 60m day has 7 bars (6 full + trailing), got %d", n)
	}
}

func TestClosedSince(t *testing.T) {
	got := ClosedSince(time.Minute, at(day0, 10, 0, 0), at(day0, 10, 2, 30))
	if len(got) != 2 || !got[0].End.Equal(at(day0, 10, 1, 0)) || !got[1].End.Equal(at(day0, 10, 2, 0)) {
		t.Fatalf("want the 10:01 and 10:02 closes, got %+v", got)
	}
	if n := len(ClosedSince(time.Minute, at(day0, 10, 0, 0), at(day0, 10, 0, 0))); n != 0 {
		t.Fatalf("nothing closes in an empty window, got %d", n)
	}
	// across midnight: the next morning's first close is after yesterday's last
	span := ClosedSince(time.Hour, at(day0, 15, 15, 0), at(day0.AddDate(0, 0, 1), 10, 15, 0))
	if len(span) != 2 || !span[0].End.Equal(at(day0, 15, 30, 0)) || !span[1].End.Equal(at(day0.AddDate(0, 0, 1), 10, 15, 0)) {
		t.Fatalf("overnight closes: %+v", span)
	}
}

func TestSnapshotBookInvariants(t *testing.T) {
	for _, sym := range []string{"ACME", "BETA"} {
		inst, _ := catalog.Lookup(sym)
		for k := 0; k < 200; k++ {
			r := Reading{Local: at(day0, 10, 0, 0).Add(time.Duration(k) * StepSeconds * time.Second), Day: day0, Phase: PhaseOpen}
			s := Snapshot(inst, r).Data
			if !s.HasLast || !s.Quote.HasBid || !s.Quote.HasAsk || len(s.Depth.Bids) != BookLevels || len(s.Depth.Asks) != BookLevels {
				t.Fatalf("open book incomplete: %+v", s)
			}
			if s.Quote.BestBid >= s.LastPrice || s.Quote.BestAsk <= s.LastPrice {
				t.Fatalf("last %d must sit inside the spread %d/%d", s.LastPrice, s.Quote.BestBid, s.Quote.BestAsk)
			}
			for i := 1; i < BookLevels; i++ {
				if s.Depth.Bids[i].Price != s.Depth.Bids[i-1].Price-inst.TickSize || s.Depth.Asks[i].Price != s.Depth.Asks[i-1].Price+inst.TickSize {
					t.Fatalf("levels must be contiguous, best-first: %+v", s.Depth)
				}
			}
			if s.Depth.Bids[0].Price != s.Quote.BestBid || s.Depth.Asks[0].Price != s.Quote.BestAsk {
				t.Fatalf("depth top != quote")
			}
			for _, l := range append(append([]api.WsDepthLevel{}, s.Depth.Bids...), s.Depth.Asks...) {
				if l.Qty <= 0 || l.Qty%inst.LotSize != 0 || l.Price%inst.TickSize != 0 {
					t.Fatalf("level off lot/tick grid: %+v", l)
				}
			}
		}
	}
}

func TestBookMovesBetweenSteps(t *testing.T) {
	inst := acme(t)
	a := Snapshot(inst, Reading{Local: at(day0, 10, 0, 0), Day: day0, Phase: PhaseOpen}).Data.Depth
	b := Snapshot(inst, Reading{Local: at(day0, 10, 0, 30), Day: day0, Phase: PhaseOpen}).Data.Depth
	same := true
	for i := range a.Bids {
		if a.Bids[i].Qty != b.Bids[i].Qty {
			same = false
		}
	}
	if same {
		t.Fatal("the ladder must change from one step to the next")
	}
}

func TestNoBookOutsideTrading(t *testing.T) {
	inst := acme(t)
	pre := Snapshot(inst, Reading{Local: at(day0, 9, 5, 0), Day: day0, Phase: PhasePreopen}).Data
	closed := Snapshot(inst, Reading{Local: at(day0, 15, 30, 0), Day: day0, Phase: PhaseClosed}).Data
	for name, s := range map[string]api.WsSnapshotData{"preopen": pre, "closed": closed} {
		if !s.HasLast || s.LastPrice <= 0 {
			t.Fatalf("%s: there is still a last price", name)
		}
		if s.Quote.HasBid || s.Quote.HasAsk || len(s.Depth.Bids)+len(s.Depth.Asks) != 0 {
			t.Fatalf("%s: no book expected, got %+v", name, s)
		}
	}
	if pre.ChangePct != 0 {
		t.Fatalf("preopen change_pct must be 0, got %v", pre.ChangePct)
	}
	// the last price after the close is the final bar's close
	lastBar := BarFor(inst, DayBuckets(day0, time.Minute)[374])
	if closed.LastPrice != lastBar.Close {
		t.Fatalf("closed last %d != final 1m bar close %d", closed.LastPrice, lastBar.Close)
	}
}

func TestChangePctIsFromSessionOpen(t *testing.T) {
	inst := acme(t)
	r := Reading{Local: at(day0, 12, 0, 0), Day: day0, Phase: PhaseOpen}
	want := float64(LastPrice(inst, r)-SessionOpenPrice(inst, r)) / float64(SessionOpenPrice(inst, r)) * 100
	if got := ChangePct(inst, r); got < want-0.006 || got > want+0.006 {
		t.Fatalf("change_pct %v, want ~%v", got, want)
	}
}
