package store

import (
	"testing"
	"time"
)

func fakeClock(start time.Time) (now func() time.Time, advance func(d time.Duration)) {
	t := start
	return func() time.Time { return t }, func(d time.Duration) { t = t.Add(d) }
}

func TestCanonicalJoinReconnectsOnSameMarket(t *testing.T) {
	now, _ := fakeClock(time.Unix(0, 0))
	s := NewSessions(now)

	first, conflict := s.JoinCanonical("a1", "IN")
	if conflict || first.SessionID == "" {
		t.Fatalf("first join: %+v conflict=%v", first, conflict)
	}
	second, conflict := s.JoinCanonical("a1", "IN")
	if conflict || second.SessionID != first.SessionID {
		t.Fatalf("reconnect must return the SAME session: %+v vs %+v (conflict=%v)", second, first, conflict)
	}
	if _, conflict := s.JoinCanonical("a1", "US"); !conflict {
		t.Fatal("a different market must conflict, not reconnect")
	}
}

func TestOneSessionGate(t *testing.T) {
	now, _ := fakeClock(time.Unix(0, 0))
	s := NewSessions(now)
	if _, conflict := s.JoinCanonical("a1", "IN"); conflict {
		t.Fatal("first join must not conflict")
	}
	if _, conflict := s.StartOnDemand("a1", "IN", time.Second, time.Minute); !conflict {
		t.Fatal("a busy account starting on-demand must conflict")
	}
	if !s.ExitBySession(mustSession(t, s, "a1").SessionID) {
		t.Fatal("exit must find the session")
	}
	if s.Active("a1") {
		t.Fatal("account must be free after exit")
	}
	if _, conflict := s.StartOnDemand("a1", "IN", time.Second, time.Minute); conflict {
		t.Fatal("a free account must be able to start on-demand")
	}
}

func TestOnDemandWarmupThenReady(t *testing.T) {
	now, advance := fakeClock(time.Unix(0, 0))
	s := NewSessions(now)
	sess, conflict := s.StartOnDemand("a1", "IN", 2*time.Second, time.Minute)
	if conflict {
		t.Fatal("unexpected conflict")
	}
	if got := s.Label(sess); got != "warming_up" {
		t.Fatalf("label before warmup ends: %q", got)
	}
	if got := s.RawStatus(sess); got != "starting" {
		t.Fatalf("raw status before warmup ends: %q", got)
	}
	advance(3 * time.Second)
	if got := s.Label(sess); got != "ready" {
		t.Fatalf("label after warmup ends: %q", got)
	}
	if got := s.RawStatus(sess); got != "active" {
		t.Fatalf("raw status after warmup ends: %q", got)
	}
}

func TestOnDemandReapsAfterSessionEnds(t *testing.T) {
	now, advance := fakeClock(time.Unix(0, 0))
	s := NewSessions(now)
	sess, _ := s.StartOnDemand("a1", "IN", time.Second, time.Minute)
	advance(2 * time.Minute)
	if s.Active("a1") {
		t.Fatal("an expired on-demand session must be reaped, not active")
	}
	if s.ExitBySession(sess.SessionID) {
		t.Fatal("exiting an already-reaped session must report not-found")
	}
}

func TestCanonicalNeverReaps(t *testing.T) {
	now, advance := fakeClock(time.Unix(0, 0))
	s := NewSessions(now)
	sess, _ := s.JoinCanonical("a1", "IN")
	advance(24 * time.Hour)
	if !s.Active("a1") {
		t.Fatal("a canonical session must never auto-expire")
	}
	if !s.ExitBySession(sess.SessionID) {
		t.Fatal("exit must still find the (still-live) canonical session")
	}
}

func mustSession(t *testing.T, s *Sessions, accountID string) Session {
	t.Helper()
	sess, ok := s.Get(accountID)
	if !ok {
		t.Fatalf("no session for %s", accountID)
	}
	return sess
}
