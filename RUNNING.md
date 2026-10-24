# RUNNING.md — how to run this project

This is the practical "get it running" doc. For what the project *is* and the rules
behind how it's built, read `CLAUDE.md` first — this file only covers starting the
servers, prerequisites, and the configuration knobs.

---

## 1. Prerequisites

| Tool | Minimum version | Used for |
|---|---|---|
| [Node.js](https://nodejs.org) | >= 20 (LTS) | frontend (Vite, React, TypeScript) |
| [Go](https://go.dev) | >= 1.22 | the mock server |
| `npm` | ships with Node | frontend package install |

Verify before anything else:

```bash
node --version
go version
```

Nothing else is required to run the mock. No database, no Docker, no external
services — the mock is a single static Go binary with everything in-memory.

---

## 2. One-time setup

```bash
git clone <this repo> && cd synthetic-mkt-ui

# Frontend deps
cd frontend && npm install && cd ..

# Frontend env file (git-ignored; see §4 for what goes in it)
cp frontend/.env.example frontend/.env
```

`contract/generated/` (the Go structs + TS types derived from `contract/openapi.yaml`)
is **committed** — you don't need to run codegen to get started. Only touch `make
generate` if you're changing `contract/openapi.yaml` itself (see §7).

---

## 3. Starting the app

Two processes, run in separate terminals, from the repo root:

```bash
make mock       # Go mock backend — HTTP + WebSocket on :8080
make frontend   # Vite dev server on :5173
```

Then open **http://localhost:5173**. The default `frontend/.env` (copied from
`.env.example`) points the frontend straight at the mock on `:8080` — nothing else
to configure for a first run.

Equivalent to the `make` targets, if you want to pass flags/env vars directly:

```bash
cd mock && go run ./cmd/mockserver          # same as `make mock`
npm --prefix frontend run dev                # same as `make frontend`
```

### Stopping / restarting

Both are plain foreground processes — `Ctrl+C` stops them. The mock has no
persistence, so restarting it always gives you a fresh account/session/order state
and (in real-time mode, the default) resets the simulated trading day — see §5.

---

## 4. Frontend configuration (`frontend/.env`)

All of it lives in one git-ignored file, `frontend/.env`, copied from
`frontend/.env.example`. Vite only reads `.env` at **process start** — editing it
requires a full restart of `make frontend`, not just a browser refresh.

| Variable | Example | What it does |
|---|---|---|
| `VITE_API_BASE` | `http://localhost:8080` | REST base for every HTTP call (broker, session, candle history). No trailing slash. Can be `""` (empty) — see "pointing at the real backend" below. |
| `VITE_WS_BASE` | `ws://localhost:8080` | Origin (not path) for the market-data WebSocket. `lib/marketStore.ts` appends `/v1/ws?session=<id>` itself. |
| `VITE_ACCOUNT_ID` | `demo-account` | **Legacy, currently unused.** Left over from before the real signup flow (`lib/account.ts`, Phase 2-era placeholder). Identity now comes from signing up at `/signup`, stored in `localStorage` (`lib/identity.ts`). Safe to ignore or delete. |

### Pointing at the mock (default)

```
VITE_API_BASE=http://localhost:8080
VITE_WS_BASE=ws://localhost:8080
```

The mock sends permissive CORS headers (`Access-Control-Allow-Origin: *`), so the
browser can call it directly cross-origin from `:5173` with no proxy needed.

### Pointing at the real backend

The real backend sends **no CORS headers at all** and never will for a
browser-origin request — pointing `VITE_API_BASE` straight at it (e.g.
`http://localhost:8000`) will fail in the browser with a generic `Failed to fetch`,
even though the same request works fine from `curl`. The fix is Vite's own dev
proxy (already wired in `vite.config.ts`, forwarding `/v1` and `/session` to
`http://localhost:8000`):

```
VITE_API_BASE=
VITE_WS_BASE=ws://localhost:5173
```

This makes every request relative (same-origin as the page, `:5173`), which Vite
then forwards server-side to the real backend — no browser CORS check applies.
`VITE_API_BASE=` (empty) is deliberately supported by `api/config.ts`; don't
confuse it with "unset" (an actually-missing variable still throws).

If the real backend's address or port changes, update the `proxy` targets in
`frontend/vite.config.ts` to match (`/v1` and `/session` → wherever it's listening).

---

## 5. Mock server configuration (env vars, all optional)

Set these before `make mock` / `go run ./cmd/mockserver` — none are required for a
normal run.

| Variable | Default | What it does |
|---|---|---|
| `MOCK_ADDR` | `:8080` | Listen address. Use if `:8080` is taken, e.g. `MOCK_ADDR=:8099 make mock` (the Makefile doesn't forward env vars through automatically on every shell — simplest is `cd mock && MOCK_ADDR=:8099 go run ./cmd/mockserver`). |
| `MOCK_SPEED` | unset (real-time) | Simulated seconds per real second, e.g. `60`. With this set, one market day (preopen → open → closing → closed) plays out in minutes and **repeats** — useful for watching every phase cycle without waiting. Its clock is *not* real time, so the UI's own wall-clock display won't match it. |
| `MOCK_OPEN_IN` | `30s` | Real-time mode only. How long after the mock starts the market opens (a Go duration string, e.g. `10s`, `2m`). |
| `MOCK_CLOSED_HOLD` | `30s` (sped-up mode) / effectively a full day (real-time mode) | How long the market stays in the `closed` phase before the next simulated day starts (sped-up mode), or before the mock just stays closed (real-time mode). |

**Default (real-time) behavior:** the mock's market clock is the real wall clock in
the market's own timezone, shifted so the market opens `MOCK_OPEN_IN` after the
process starts, runs the normal ~6.5-hour trading day, then stays closed until you
restart the process. This is what makes the UI's own clock, `/v1/markets`'
`opens_at`/`closes_at`, and the WS phase all agree without any extra work.

Example — watch phases cycle quickly during UI development:

```bash
cd mock && MOCK_SPEED=60 go run ./cmd/mockserver
```

---

## 6. Running tests

```bash
cd frontend && npm test          # vitest — pure logic only (no DOM), see CLAUDE.md
cd mock && go test ./...         # decodes every mock response against the generated
                                  # structs; also exercises session/broker/market logic
```

Component-level UI is **not** covered by the frontend test suite (the vitest
environment is `node`, no DOM) — those are verified by hand in the browser via
`/kit` (every shared component, Night + Lab side by side) and the real screens.

---

## 7. Regenerating the contract (only if you changed `contract/openapi.yaml`)

```bash
make generate   # regenerates contract/generated/go/types.gen.go and
                 # contract/generated/ts/api.d.ts from contract/openapi.yaml
make check      # same as generate, then fails if the committed generated/
                 # files don't match — this is what CI runs
```

`make generate-ts` calls `openapi-typescript` via `npx --no-install`, so
`frontend/npm install` must have already run at least once (it's a `devDependency`,
not fetched on demand). `make generate-go` pulls `oapi-codegen` itself via `go run`
on first use (needs network the very first time; cached after).

Always commit the regenerated files alongside the contract change — `make check` is
what catches a mismatch if you forget.

---

## 8. Building for production

```bash
cd frontend && npm run build     # tsc -b && vite build -> frontend/dist/
```

There is no production build step for the mock — it's dev/test tooling only, never
meant to be deployed; `go build ./cmd/mockserver` produces a runnable binary if you
need one for CI or scripted testing.

---

## 9. Ports at a glance

| Port | What |
|---|---|
| `:5173` | Vite dev server (frontend) |
| `:8080` | Mock server default (`MOCK_ADDR` to change) |
| `:8000` | Where `vite.config.ts`'s dev proxy currently points for "real backend" mode — adjust if the real backend's actual address differs |

---

## 10. If something won't start

- **"Failed to fetch" on every API call in the browser, but `curl` works fine** —
  almost always the CORS issue in §4 ("pointing at the real backend"). Check
  `VITE_API_BASE`/`VITE_WS_BASE` match one of the two supported modes exactly.
- **Edited `.env` but nothing changed** — restart `make frontend`; Vite doesn't
  hot-reload env vars.
- **`make check` fails** — you changed `contract/openapi.yaml` without running
  `make generate` and committing the result, or hand-edited a file under
  `contract/generated/` directly (don't — it's codegen output).
- **Port already in use** — something else is already listening on `:8080` or
  `:5173`; either stop it or use `MOCK_ADDR` (mock) / Vite's own `--port` flag
  (frontend) to pick a different one.

For anything deeper than "how do I start it" — contract shapes, design tokens,
mock behavior, known gotchas from past sessions — see `CLAUDE.md`.
