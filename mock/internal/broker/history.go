package broker

import (
	"fmt"
	"sort"
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
)

// The durable account history: a deterministic set of closed trades the durable reads
// (/trades, /pnl, /costs, /costs/summary) and /observation's recent_trades all derive from,
// so the pages, the aggregates and the per-trade cost lines always agree with each other.
//
// Not a market model: prices are a fixed walk on the tick grid. Trades are spread over the
// last ~9 days (3 a day, newest first) so keyset paging has real pages to walk.

const historyTrades = 27

// IST (UTC+5:30) exit times for the three daily slots, as minutes after 00:00 IST.
var exitSlotsIST = [3]int{14*60 + 40, 12*60 + 5, 10*60 + 20}

// costOrder is the stable order of cost-line names (the IN rules).
var costOrder = []string{"stt", "exchange", "sebi", "stamp", "gst", "autosquare_fee"}

type historyItem struct {
	trade api.Trade
	costs api.CostsTrade
}

// history builds the trade history relative to `now`, newest first with unique exit times.
func history(now time.Time) []historyItem {
	ist := time.FixedZone("IST", 5*3600+30*60)
	today := time.Date(now.In(ist).Year(), now.In(ist).Month(), now.In(ist).Day(), 0, 0, 0, 0, ist)

	items := make([]historyItem, 0, historyTrades)
	for i := 0; i < historyTrades; i++ {
		day, slot := i/3, i%3
		exit := today.AddDate(0, 0, -day-1).Add(time.Duration(exitSlotsIST[slot]) * time.Minute).UTC()
		entry := exit.Add(-time.Duration(20+(i*7)%50) * time.Minute)

		sym, tick, ref, lot := "SYNTH DEF", int64(5), int64(10090), int64(1)
		if i%2 == 1 {
			sym, ref, lot = "BETA", 4995, 10
		}
		qty := lot * int64(5+(i*3)%8)
		dir := "long"
		if i%4 == 3 {
			dir = "short"
		}
		entryPx := ref + int64((i*3)%7-3)*tick
		deltaTicks := int64((i*5)%11 - 5) // -5..+5 ticks, includes 0
		auto := i%5 == 4
		reason := "manual"
		if auto {
			reason = "autosquare"
		}
		if i == 13 { // a true breakeven: no price change and no costs at all
			deltaTicks = 0
		}
		exitPx := entryPx + deltaTicks*tick

		gross := (exitPx - entryPx) * qty
		if dir == "short" {
			gross = -gross
		}

		lines := costLines(qty, entryPx, exitPx, auto && i != 13)
		if i == 13 {
			lines = nil
		}
		var total int64
		for _, l := range lines {
			total += l.Amount
		}
		net := gross - total

		id := fmt.Sprintf("t-%04d", historyTrades-i)
		items = append(items, historyItem{
			trade: api.Trade{
				TradeId: id, Instrument: sym, Direction: dir, Quantity: qty,
				EntryPrice: entryPx, ExitPrice: exitPx, EntryAt: entry, ExitAt: exit,
				GrossPnl: gross, TotalCosts: total, NetPnl: net,
				PnlPct: float32(round2(float64(net) / float64(entryPx*qty) * 100)), ExitReason: reason,
			},
			costs: api.CostsTrade{TradeId: id, Lines: nonNilLines(lines), Total: total},
		})
	}
	sort.SliceStable(items, func(a, b int) bool { return items[a].trade.ExitAt.After(items[b].trade.ExitAt) })
	return items
}

// costLines applies simple integer approximations of the IN cost rules. Only NON-ZERO
// lines are returned (the contract: "only non-zero lines present"), so small trades
// legitimately have no `sebi` line.
func costLines(qty, entryPx, exitPx int64, autosquare bool) []api.CostLine {
	turnover := qty * (entryPx + exitPx)
	exchange := turnover * 345 / 10_000_000
	sebi := turnover / 1_000_000
	amounts := map[string]int64{
		"stt":      qty * exitPx * 25 / 100_000,
		"exchange": exchange,
		"sebi":     sebi,
		"stamp":    qty * entryPx * 3 / 100_000,
		"gst":      (exchange + sebi) * 18 / 100,
	}
	if autosquare {
		amounts["autosquare_fee"] = 5_900
	}
	var out []api.CostLine
	for _, name := range costOrder {
		if a := amounts[name]; a != 0 {
			out = append(out, api.CostLine{Name: name, Amount: a})
		}
	}
	return out
}

func nonNilLines(l []api.CostLine) []api.CostLine {
	if l == nil {
		return []api.CostLine{}
	}
	return l
}

func round2(f float64) float64 {
	if f < 0 {
		return -float64(int64(-f*100+0.5)) / 100
	}
	return float64(int64(f*100+0.5)) / 100
}

// page applies keyset paging: items strictly older than `before`, at most `limit`, plus the
// cursor for the next page (nil on the last page).
func page(items []historyItem, before *time.Time, limit int) (out []historyItem, nextBefore *time.Time) {
	rest := items
	if before != nil {
		rest = rest[:0:0]
		for _, it := range items {
			if it.trade.ExitAt.Before(*before) {
				rest = append(rest, it)
			}
		}
	}
	if len(rest) > limit {
		last := rest[limit-1].trade.ExitAt
		return rest[:limit], &last
	}
	return rest, nil
}

// pnlSummary aggregates every trade. A trade is a win/loss by NET result; a net of exactly 0
// is counted in neither.
func pnlSummary(items []historyItem) api.PnlSummary {
	var s api.PnlSummary
	for _, it := range items {
		t := it.trade
		s.TradeCount++
		s.GrossPnl += t.GrossPnl
		s.TotalCosts += t.TotalCosts
		s.NetPnl += t.NetPnl
		switch {
		case t.NetPnl > 0:
			s.WinCount++
		case t.NetPnl < 0:
			s.LossCount++
		}
	}
	return s
}

// costsSummary aggregates cost lines by name across every trade.
func costsSummary(items []historyItem) api.CostsSummary {
	byName := map[string]int64{}
	var total int64
	for _, it := range items {
		for _, l := range it.costs.Lines {
			byName[l.Name] += l.Amount
		}
		total += it.costs.Total
	}
	lines := []api.CostLine{}
	for _, name := range costOrder {
		if a := byName[name]; a != 0 {
			lines = append(lines, api.CostLine{Name: name, Amount: a})
		}
	}
	return api.CostsSummary{TradeCount: len(items), Lines: lines, Total: total}
}
