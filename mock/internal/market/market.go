package market

import (
	"os"
	"strconv"
	"time"
)

// Two pacings:
//
//   - REAL TIME (the default). The mock's market time IS the real wall clock in the market's zone,
//     so a UI that compares its own clock with the market's opens_at / closes_at agrees with the
//     mock's phases and bars. The schedule is shifted so the market OPENS `MOCK_OPEN_IN` (default
//     30s) after the mock starts, then runs the normal 6.5-hour day (open, closing, closed) and
//     stays closed. Restart the mock to get a fresh day.
//   - SPED UP. Set MOCK_SPEED (simulated seconds per real second, e.g. 60): one market day plays in
//     minutes and repeats, so the whole preopen -> open -> closing -> closed cycle can be watched
//     (MOCK_CLOSED_HOLD, default 30s). Its times are NOT real, so a UI clock will not match them.
const (
	DefaultOpenIn     = 30 * time.Second
	DefaultClosedHold = 30 * time.Second
	realTimeHold      = 24 * time.Hour
)

// NewDefaultClock builds the clock from the environment. The first simulated day is today's
// date in `tz` (so candle history lines up with "today" in the market).
func NewDefaultClock(tz *time.Location) *Clock {
	now := time.Now().In(tz)
	day0 := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	if v, err := strconv.ParseFloat(os.Getenv("MOCK_SPEED"), 64); err == nil && v > 0 {
		hold := DefaultClosedHold
		if d, err := time.ParseDuration(os.Getenv("MOCK_CLOSED_HOLD")); err == nil && d >= 0 {
			hold = d
		}
		return NewClock(v, hold, day0, time.Now)
	}

	openIn := DefaultOpenIn
	if d, err := time.ParseDuration(os.Getenv("MOCK_OPEN_IN")); err == nil && d >= 0 {
		openIn = d
	}
	hold := realTimeHold
	if d, err := time.ParseDuration(os.Getenv("MOCK_CLOSED_HOLD")); err == nil && d >= 0 {
		hold = d
	}
	tod := time.Duration(now.Hour())*time.Hour + time.Duration(now.Minute())*time.Minute + time.Duration(now.Second())*time.Second
	ShiftSchedule(tod + openIn - openAt) // the open lands openIn after "now"
	c := NewClock(1, hold, day0, time.Now)
	c.start = c.start.Add(-(openAt - preopenAt - openIn)) // we start inside pre-open, openIn before the open
	return c
}
