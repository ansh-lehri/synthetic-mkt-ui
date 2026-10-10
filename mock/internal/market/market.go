package market

import (
	"os"
	"strconv"
	"time"
)

// Default pacing: one market day (6.5 simulated hours) plays in 6.5 real minutes, so a
// 1-minute bar closes every real second and the whole open -> closing -> closed cycle can be
// watched. Override with MOCK_SPEED (simulated seconds per real second) and MOCK_CLOSED_HOLD.
const (
	DefaultSpeed      = 60.0
	DefaultClosedHold = 30 * time.Second
)

// NewDefaultClock builds the clock from the environment. The first simulated day is today's
// date in `tz` (so candle history lines up with "today" in the market).
func NewDefaultClock(tz *time.Location) *Clock {
	speed := DefaultSpeed
	if v, err := strconv.ParseFloat(os.Getenv("MOCK_SPEED"), 64); err == nil && v > 0 {
		speed = v
	}
	hold := DefaultClosedHold
	if v, err := time.ParseDuration(os.Getenv("MOCK_CLOSED_HOLD")); err == nil && v >= 0 {
		hold = v
	}
	now := time.Now().In(tz)
	day0 := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	return NewClock(speed, hold, day0, time.Now)
}
