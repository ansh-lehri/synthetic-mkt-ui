# REPO-SETUP.md — Phase 0 scaffold brief (for Claude Code)

> Hand this to Claude Code (Desktop, interactively) to lay down the monorepo. It is a
> repo-level build instruction, not application code. Work top to bottom; verify each
> step before the next. Do not build any screen here — Phase 0 is scaffold + contract
> + tokens + the two shared utilities only.

## 0. Preconditions (verify, don't assume)

Run and report versions before scaffolding:

```
node --version   # need >= 20 (LTS). If missing/older, stop and tell the user.
go version        # need >= 1.22. (User has Go.)
git --version
```

The repo already exists and is pushed by the user. Work inside it; don't create a new repo.

## 1. Drop the standing docs at repo root

These are authored already — place them verbatim:

- `CLAUDE.md`
- `DEVELOPMENT-PLAN.md`
- `UI-API-Coverage-Tracker.md`
- `contract/openapi.yaml`
- `contract/ws-schemas.md`
- `frontend/src/tokens/tokens.css`  (and wire Tailwind per `tokens/tailwind.tokens.md`)
- `docs/` ← the broker + market-data design docs (reference)

## 2. Target layout

```
market-sim/
├── CLAUDE.md
├── DEVELOPMENT-PLAN.md
├── UI-API-Coverage-Tracker.md
├── .gitignore
├── contract/
│   ├── openapi.yaml
│   ├── ws-schemas.md
│   └── generated/            # codegen output, COMMITTED
│       ├── go/               # Go structs for the mock
│       └── ts/               # TS types for the frontend
├── mock/                     # Go module (its own go.mod)
│   ├── go.mod
│   ├── cmd/mockserver/main.go
│   └── internal/
│       ├── broker/           # 12 broker endpoints
│       ├── marketdata/       # /v1/candles + /ws
│       └── session/          # /v1/markets, /instruments, /session, /session/*
├── frontend/                 # Vite + React + TS
│   ├── package.json
│   ├── index.html
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx
│       ├── tokens/tokens.css
│       ├── api/              # generated TS types + base-URL-swappable client
│       ├── lib/
│       │   ├── ticks.ts      # the tick formatter (spec below)
│       │   └── ws.ts         # ws client (Phase 3; stub file now)
│       ├── components/       # shared kit (Phase 1)
│       └── features/         # one folder per screen
└── docs/
```

## 3. Frontend scaffold

```
cd frontend
npm create vite@latest . -- --template react-ts
npm i
npm i -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm i @tanstack/react-query zustand klinecharts
```

- Wire Tailwind per `tokens/tailwind.tokens.md`; import `tokens/tokens.css` in `main.tsx`.
- Add the theme toggle: set/remove `data-theme="lab"` on `<html>`, persisted in `localStorage`.
- `.env` holds the base URLs so mock↔real is a config swap:
  ```
  VITE_API_BASE=http://localhost:8080      # broker + session + candle history
  VITE_WS_BASE=ws://localhost:8080/ws       # market-data live
  ```
  The API client reads these; no base URL is ever hardcoded in a component.

## 4. Mock scaffold (Go)

```
cd mock
go mod init <module-path>/mock   # e.g. github.com/<user>/market-sim/mock
go get github.com/gorilla/websocket
```

- `cmd/mockserver/main.go`: one `http.ServeMux`, one port (8080), registers all routes
  from the three internal packages. CORS-open for local dev.
- Phase 0 target for the mock is the **skeleton only** (Phase 1 item): every endpoint
  returns a **valid, correctly-shaped** response with placeholder data, correct status
  codes, and the two error envelopes. No market realism yet (that's Phase 3).
- Mock uses the **generated Go structs** so its responses can't drift from the contract.

## 5. Codegen (the single-source wiring)

Generate from `contract/openapi.yaml` into `contract/generated/`, committed:

- **Go structs** (for the mock) — use `oapi-codegen`:
  ```
  go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest
  oapi-codegen -package api -generate types contract/openapi.yaml > contract/generated/go/types.gen.go
  ```
- **TS types** (for the frontend) — use `openapi-typescript`:
  ```
  cd frontend && npx openapi-typescript ../contract/openapi.yaml -o ../contract/generated/ts/api.d.ts
  ```
- Add a root `make generate` (or npm script) that runs both, so regeneration is one command.
- **WebSocket** types are hand-authored from `contract/ws-schemas.md` into
  `contract/generated/ts/ws.ts` (and a matching Go file if the mock needs them) — OpenAPI
  doesn't cover WS. Keep them in sync with the md by hand; it's a small, stable set.

## 6. The tick formatter (`frontend/src/lib/ticks.ts`) — build this in Phase 0

The one util every numeric display goes through. Spec:

- Input: a bare `int64` value (price in ticks, or money in minor units) + the instrument's
  `tick_size` and `price_decimals` (from `GET /v1/instruments`).
- Output: a display string. For prices: `value` scaled by `tick_size` and shown to
  `price_decimals` decimals. For money/P&L: a signed string with the **"units"** label
  (no currency symbol), grouped with the en-IN style separators.
- A companion that returns `{ text, direction: "up"|"down"|"flat" }` so the ▲/▼ + colour
  component never re-derives sign.
- Pure functions, unit-tested. No React. This is the single place currency/scaling lives.

## 7. .gitignore essentials

`node_modules/`, `frontend/dist/`, Go build artifacts, `.env` (commit `.env.example`
instead), editor dirs. Do **not** gitignore `contract/generated/` — it is committed.

## 8. Definition of done for Phase 0

- `npm run dev` serves the frontend; theme toggle flips Night/Lab via tokens.
- `go run ./cmd/mockserver` serves all endpoints with valid shapes + `/ws` upgrades.
- `make generate` regenerates Go + TS types from the contract with no diff.
- `ticks.ts` exists and passes its tests.
- All standing docs are at the paths in §2.
- A smoke check: the frontend can call `GET /v1/markets` on the mock and render the
  dropdown. (Nothing more — screens are later phases.)

Open a single PR titled "Phase 0: scaffold + contract + tokens". No screens in it.