package market

import (
	"time"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/catalog"
)

// Timeframes is the allowlist shared by /v1/candles and /ws.
var Timeframes = map[string]time.Duration{
	"1m":  time.Minute,
	"5m":  5 * time.Minute,
	"30m": 30 * time.Minute,
	"60m": 60 * time.Minute,
}

// Bucket is one candle period: [Start, End). Buckets are aligned to the session open and the
// last one of a day is cut short at the close (e.g. 60m: ... 14:15-15:15, then 15:15-15:30).
type Bucket struct{ Start, End time.Time }

// DayBuckets lists a day's buckets.
func DayBuckets(day time.Time, step time.Duration) []Bucket {
	open, closeT := Open(day), Close(day)
	var out []Bucket
	for s := open; s.Before(closeT); s = s.Add(step) {
		e := s.Add(step)
		if e.After(closeT) {
			e = closeT
		}
		out = append(out, Bucket{Start: s, End: e})
	}
	return out
}

// BucketsInRange lists buckets that START in [from, to) and are FINALIZED (end <= now).
// Model A: a bar exists in history only once its bucket has closed.
func BucketsInRange(step time.Duration, from, to, now time.Time) []Bucket {
	var out []Bucket
	for d := Midnight(from); d.Before(to); d = d.AddDate(0, 0, 1) {
		for _, b := range DayBuckets(d, step) {
			if !b.Start.Before(from) && b.Start.Before(to) && !b.End.After(now) {
				out = append(out, b)
			}
		}
	}
	return out
}

// ClosedSince lists buckets that closed in (after, upTo] — what a socket must push next.
func ClosedSince(step time.Duration, after, upTo time.Time) []Bucket {
	var out []Bucket
	for d := Midnight(after); !d.After(upTo); d = d.AddDate(0, 0, 1) {
		for _, b := range DayBuckets(d, step) {
			if b.End.After(after) && !b.End.After(upTo) {
				out = append(out, b)
			}
		}
	}
	return out
}

// BarFor builds the OHLCV bar of a bucket from the price process.
func BarFor(inst catalog.Instrument, b Bucket) api.Bar {
	k0, k1 := StepIndex(b.Start), StepIndex(b.End)
	open := price(inst, k0)
	hi, lo, closePx := open, open, open
	var vol int64
	for k := k0; k < k1; k++ {
		p := price(inst, k)
		if p > hi {
			hi = p
		}
		if p < lo {
			lo = p
		}
		closePx = p
		vol += stepVolume(inst, k)
	}
	return api.Bar{
		Start: b.Start.Format(catalog.NaiveLayout), End: b.End.Format(catalog.NaiveLayout),
		Open: open, High: hi, Low: lo, Close: closePx, Volume: vol,
	}
}
