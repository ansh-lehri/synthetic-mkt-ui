// Package market is the mock's market simulation: a session clock, a deterministic price
// process, a moving order book and Model-A candles.
//
// Everything is a pure function of (instrument, simulated time), so REST history, finalized
// bars pushed over /ws and live snapshots can never disagree with each other. Times here are
// NAIVE-LOCAL market wall-clock values labelled UTC purely so they can be held in a time.Time
// (no zone arithmetic ever happens): "2026-10-09T09:15:00" is 09:15 in the market's own tz.
package market

import "time"

// Phase names match the contract enum.
const (
	PhasePreopen = "preopen"
	PhaseOpen    = "open"
	PhaseClosing = "closing"
	PhaseClosed  = "closed"
)

// Session schedule, as offsets from local midnight. Variables (not constants) only so the
// real-time demo mode can shift the whole schedule to start "now" (see ShiftSchedule).
var (
	preopenAt = 9 * time.Hour
	openAt    = 9*time.Hour + 15*time.Minute
	closingAt = 15*time.Hour + 15*time.Minute
	closeAt   = 15*time.Hour + 30*time.Minute
)

// Clock turns wall-clock time into simulated market time. A "cycle" is one market day,
// preopen (09:00) through close (15:30), compressed by `speed` (simulated seconds per real
// second), followed by `hold` of real time spent closed; then the next day begins. So a
// watcher sees preopen -> open -> closing -> closed -> preopen again.
type Clock struct {
	speed float64
	hold  time.Duration
	start time.Time
	day0  time.Time // first simulated day, 00:00 (naive-local)
	now   func() time.Time
}

// NewClock starts the simulation now. day0 is the date of the first simulated day.
func NewClock(speed float64, hold time.Duration, day0 time.Time, now func() time.Time) *Clock {
	if speed <= 0 {
		speed = 1
	}
	return &Clock{speed: speed, hold: hold, start: now(), day0: day0, now: now}
}

// Reading is the simulated market time at one instant.
type Reading struct {
	Local time.Time // naive-local wall clock
	Day   time.Time // that day's 00:00
	Phase string
}

// Read returns the current simulated time and session phase.
func (c *Clock) Read() Reading {
	span := closeAt - preopenAt
	simReal := time.Duration(float64(span) / c.speed)
	cycle := simReal + c.hold
	elapsed := c.now().Sub(c.start)
	if elapsed < 0 {
		elapsed = 0
	}
	idx := int(elapsed / cycle)
	within := elapsed % cycle
	day := c.day0.AddDate(0, 0, idx)
	off := closeAt
	if within < simReal {
		off = preopenAt + time.Duration(float64(within)*c.speed)
	}
	return Reading{Local: day.Add(off), Day: day, Phase: phaseAt(off)}
}

func phaseAt(off time.Duration) string {
	switch {
	case off < openAt:
		return PhasePreopen
	case off < closingAt:
		return PhaseOpen
	case off < closeAt:
		return PhaseClosing
	default:
		return PhaseClosed
	}
}

// Open / Close return a day's session window.
func Open(day time.Time) time.Time  { return day.Add(openAt) }
func Close(day time.Time) time.Time { return day.Add(closeAt) }

// Trading reports whether the book is live (open or closing).
func Trading(phase string) bool { return phase == PhaseOpen || phase == PhaseClosing }

// Midnight returns the 00:00 of t's date.
func Midnight(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// StepInterval is the real time between price steps — the snapshot cadence. It is the
// simulated step (StepSeconds) divided by the speed, never shorter than 50ms.
func (c *Clock) StepInterval() time.Duration {
	d := time.Duration(float64(StepSeconds) * float64(time.Second) / c.speed)
	if d < 50*time.Millisecond {
		return 50 * time.Millisecond
	}
	return d
}

// ShiftSchedule moves the whole session schedule (preopen, open, closing, close) by d. It is
// called once at startup by the real-time demo mode, before any clock or request exists.
func ShiftSchedule(d time.Duration) {
	preopenAt += d
	openAt += d
	closingAt += d
	closeAt += d
}

// RealUTC reinterprets a naive-local wall-clock time.Time (as produced by Clock/Open/
// Close — labelled UTC but meaning local wall time in the market's own zone) as
// actually being in loc, and returns the genuine UTC instant. Needed wherever the real
// contract wants an actual RFC3339 instant (GET /v1/markets' session window,
// on-demand's warmup/session-end timers) rather than the naive-local string convention
// used by candles/WS.
func RealUTC(loc *time.Location, naive time.Time) time.Time {
	return time.Date(naive.Year(), naive.Month(), naive.Day(), naive.Hour(), naive.Minute(), naive.Second(), naive.Nanosecond(), loc).UTC()
}
