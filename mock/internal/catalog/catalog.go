// Package catalog is the mock's reference data: the markets and the invented instruments.
// Phase 1b: exactly one market (IN) with two instruments. No real securities.
package catalog

import (
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
)

// NaiveLayout is the naive-local ISO-8601 layout: no offset, no "Z". The tz travels in a
// separate `timezone` field.
const NaiveLayout = "2006-01-02T15:04:05"

// Market is a tradable market with its daily live-session window (local time).
type Market struct {
	Code, Name, Timezone string
	OpenH, OpenM         int
	CloseH, CloseM       int
}

// Instrument is an invented tradable. Prices are bare int64 raw units: TickSize is the
// smallest increment in those units, PriceDecimals how many decimals to show. RefPrice is
// the mock's reference (last) price, always on the tick grid.
type Instrument struct {
	Symbol, Name  string
	TickSize      int64
	LotSize       int64
	PriceDecimals int
	RefPrice      int64
}

var markets = []Market{
	{Code: "IN", Name: "India", Timezone: "Asia/Kolkata", OpenH: 9, OpenM: 15, CloseH: 15, CloseM: 30},
}

var instruments = map[string][]Instrument{
	"IN": {
		{Symbol: "ACME", Name: "Acme Industries", TickSize: 5, LotSize: 1, PriceDecimals: 2, RefPrice: 10090},
		{Symbol: "BETA", Name: "Beta Holdings", TickSize: 5, LotSize: 10, PriceDecimals: 2, RefPrice: 4995},
	},
}

// Markets returns all markets.
func Markets() []Market { return markets }

// FindMarket looks a market up by code.
func FindMarket(code string) (Market, bool) {
	for _, m := range markets {
		if m.Code == code {
			return m, true
		}
	}
	return Market{}, false
}

// Timezone returns the IANA timezone of a market, or "" if unknown.
func Timezone(code string) string {
	if m, ok := FindMarket(code); ok {
		return m.Timezone
	}
	return ""
}

// InstrumentsFor lists a market's instruments.
func InstrumentsFor(market string) []Instrument { return instruments[market] }

// Lookup finds an instrument by symbol across all markets.
func Lookup(symbol string) (Instrument, bool) {
	for _, list := range instruments {
		for _, in := range list {
			if in.Symbol == symbol {
				return in, true
			}
		}
	}
	return Instrument{}, false
}

// API converts to the contract shape.
func (i Instrument) API() api.Instrument {
	return api.Instrument{
		Instrument:    i.Symbol,
		Name:          i.Name,
		TickSize:      i.TickSize,
		LotSize:       i.LotSize,
		PriceDecimals: i.PriceDecimals,
	}
}

// Location returns the market's time zone (UTC if the tz database can't resolve it).
func (m Market) Location() *time.Location {
	loc, err := time.LoadLocation(m.Timezone)
	if err != nil {
		return time.UTC
	}
	return loc
}

// Today returns today's session open/close as naive-local ISO strings.
func (m Market) Today() (opens, closes string) {
	now := time.Now().In(m.Location())
	o := time.Date(now.Year(), now.Month(), now.Day(), m.OpenH, m.OpenM, 0, 0, m.Location())
	c := time.Date(now.Year(), now.Month(), now.Day(), m.CloseH, m.CloseM, 0, 0, m.Location())
	return o.Format(NaiveLayout), c.Format(NaiveLayout)
}
