package main

import (
	"fmt"
	"sync"
	"testing"

	"github.com/ansh-2505-lehri/synthetic-mkt-ui/mock/internal/guest"
)

type quotaBody struct {
	Used      int `json:"used"`
	Limit     int `json:"limit"`
	Remaining int `json:"remaining"`
}

func TestGuestQuota(t *testing.T) {
	e := newEnv(t)
	gid := "guest_00000000-0000-0000-0000-000000000001"

	// fresh guest → 0 used, 3 remaining
	var q quotaBody
	decode(t, e.want("GET", "/api/guest/quota?guest_id="+gid, "", 200), &q)
	if q.Used != 0 || q.Limit != guest.FreeSessionLimit || q.Remaining != guest.FreeSessionLimit {
		t.Fatalf("fresh quota = %+v", q)
	}

	// consume once → 1 used, 2 remaining
	decode(t, e.want("POST", "/api/guest/consume", `{"guest_id":"`+gid+`"}`, 200), &q)
	if q.Used != 1 || q.Remaining != 2 {
		t.Fatalf("after 1 consume = %+v", q)
	}

	// quota reflects the consumption
	decode(t, e.want("GET", "/api/guest/quota?guest_id="+gid, "", 200), &q)
	if q.Used != 1 || q.Remaining != 2 {
		t.Fatalf("quota after 1 consume = %+v", q)
	}

	// consume to the limit
	decode(t, e.want("POST", "/api/guest/consume", `{"guest_id":"`+gid+`"}`, 200), &q)
	decode(t, e.want("POST", "/api/guest/consume", `{"guest_id":"`+gid+`"}`, 200), &q)
	if q.Used != guest.FreeSessionLimit || q.Remaining != 0 {
		t.Fatalf("at limit = %+v", q)
	}

	// 4th consume → 409 error envelope
	wantError(t, e.want("POST", "/api/guest/consume", `{"guest_id":"`+gid+`"}`, 409))

	// quota still shows 3/0 after the rejected attempt
	decode(t, e.want("GET", "/api/guest/quota?guest_id="+gid, "", 200), &q)
	if q.Used != guest.FreeSessionLimit || q.Remaining != 0 {
		t.Fatalf("quota after over-limit attempt = %+v", q)
	}
}

func TestGuestQuotaValidation(t *testing.T) {
	e := newEnv(t)

	// missing guest_id → 400
	wantError(t, e.want("GET", "/api/guest/quota", "", 400))

	// wrong method on quota → 405
	wantError(t, e.want("POST", "/api/guest/quota?guest_id=guest_abc", "", 405))

	// missing guest_id on consume → 400
	wantError(t, e.want("POST", "/api/guest/consume", `{}`, 400))

	// invalid guest_id (no "guest_" prefix) → 400
	wantError(t, e.want("POST", "/api/guest/consume", `{"guest_id":"not-a-guest"}`, 400))

	// wrong method on consume → 405
	wantError(t, e.want("GET", "/api/guest/consume?guest_id=guest_abc", "", 405))

	// bad JSON → 400
	wantError(t, e.want("POST", "/api/guest/consume", `{`, 400))
}

func TestGuestConsumeIsolation(t *testing.T) {
	e := newEnv(t)
	gid1 := "guest_00000000-0000-0000-0000-000000000002"
	gid2 := "guest_00000000-0000-0000-0000-000000000003"

	// consume g1 to the limit
	for i := 0; i < guest.FreeSessionLimit; i++ {
		e.want("POST", "/api/guest/consume", `{"guest_id":"`+gid1+`"}`, 200)
	}
	wantError(t, e.want("POST", "/api/guest/consume", `{"guest_id":"`+gid1+`"}`, 409))

	// g2 is untouched
	var q quotaBody
	decode(t, e.want("GET", "/api/guest/quota?guest_id="+gid2, "", 200), &q)
	if q.Used != 0 || q.Remaining != guest.FreeSessionLimit {
		t.Fatalf("g2 should be fresh, got %+v", q)
	}
}

func TestGuestConsumeRaceNeverExceedsLimit(t *testing.T) {
	e := newEnv(t)
	// Each goroutine tries to consume once. With N = limit * 4 goroutines we
	// expect exactly limit successes and the rest to be 409s.
	const goroutines = guest.FreeSessionLimit * 4
	gid := "guest_00000000-0000-0000-0000-000000000004"

	results := make([]int, goroutines)
	var wg sync.WaitGroup
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			status, _ := e.call("POST", "/api/guest/consume",
				fmt.Sprintf(`{"guest_id":"%s"}`, gid))
			results[idx] = status
		}(i)
	}
	wg.Wait()

	successes, conflicts := 0, 0
	for _, s := range results {
		switch s {
		case 200:
			successes++
		case 409:
			conflicts++
		default:
			t.Errorf("unexpected status %d", s)
		}
	}
	if successes != guest.FreeSessionLimit {
		t.Errorf("expected exactly %d successes, got %d", guest.FreeSessionLimit, successes)
	}
	if conflicts != goroutines-guest.FreeSessionLimit {
		t.Errorf("expected %d conflicts, got %d", goroutines-guest.FreeSessionLimit, conflicts)
	}

	// Final quota must show exactly limit used
	var q quotaBody
	decode(t, e.want("GET", "/api/guest/quota?guest_id="+gid, "", 200), &q)
	if q.Used != guest.FreeSessionLimit || q.Remaining != 0 {
		t.Errorf("final quota = %+v, want used=%d remaining=0", q, guest.FreeSessionLimit)
	}
}
