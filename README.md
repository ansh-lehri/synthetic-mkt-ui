# synthetic-mkt-ui

A synthetic stock-market "flight simulator": a React frontend plus a Go mock backend, built
contract-first so the real backend drops in by changing one base URL. Read `CLAUDE.md` first.

## Quickstart

Requires Node >= 20 and Go >= 1.22.

```
cp frontend/.env.example frontend/.env   # VITE_API_BASE / VITE_WS_BASE
(cd frontend && npm install)

make mock        # Go mock on :8080 (HTTP + /ws)
make frontend    # Vite dev server on :5173
```

| Command | What |
|---|---|
| `make generate` | Regenerate Go + TS types from `contract/openapi.yaml` into `contract/generated/` |
| `make check` | Regenerate and fail if `contract/generated/` differs from what is committed |
| `cd frontend && npm test` | Unit tests (tick formatter) |
| `cd mock && go test ./...` | Mock route + WS smoke tests |
