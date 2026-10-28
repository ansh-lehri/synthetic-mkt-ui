package main

import (
	"testing"
)

func TestEarlyAccessRegister(t *testing.T) {
	e := newEnv(t)

	// valid submission → 201 {"ok":true}
	type okBody struct {
		OK bool `json:"ok"`
	}
	var ok okBody
	decode(t, e.want("POST", "/api/early-access/register",
		`{"email":"alice@example.com","experience":"new","market":"india","source":"hero"}`,
		201), &ok)
	if !ok.OK {
		t.Fatal("expected ok:true")
	}

	// duplicate email → still 201 (idempotent)
	decode(t, e.want("POST", "/api/early-access/register",
		`{"email":"alice@example.com","experience":"active","market":null,"source":"footer"}`,
		201), &ok)
	if !ok.OK {
		t.Fatal("duplicate email should return 201")
	}

	// missing / blank experience → 400 error envelope
	wantError(t, e.want("POST", "/api/early-access/register",
		`{"email":"bob@example.com","experience":"","source":"nav"}`,
		400))

	// unknown experience value → 400
	wantError(t, e.want("POST", "/api/early-access/register",
		`{"email":"bob@example.com","experience":"expert","source":"nav"}`,
		400))

	// invalid email (no @) → 400
	wantError(t, e.want("POST", "/api/early-access/register",
		`{"email":"notanemail","experience":"some","source":"nav"}`,
		400))

	// empty email → 400
	wantError(t, e.want("POST", "/api/early-access/register",
		`{"email":"","experience":"some","source":"nav"}`,
		400))

	// optional market absent → still 201
	decode(t, e.want("POST", "/api/early-access/register",
		`{"email":"carol@example.com","experience":"active","source":"footer"}`,
		201), &ok)
	if !ok.OK {
		t.Fatal("absent market field should be accepted")
	}

	// optional market null → still 201
	decode(t, e.want("POST", "/api/early-access/register",
		`{"email":"dave@example.com","experience":"some","market":null,"source":"footer"}`,
		201), &ok)
	if !ok.OK {
		t.Fatal("null market should be accepted")
	}
}
