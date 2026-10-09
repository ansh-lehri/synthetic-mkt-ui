# Synthetic Market Simulator — root tasks.
#
#   make generate   regenerate Go structs + TS types from contract/openapi.yaml
#   make check      fail if generated output differs from what is committed
#   make mock       run the Go mock server on :8080
#   make frontend   run the Vite dev server

OAPI_CODEGEN_VERSION := v2.5.1
OAPI_CODEGEN         := github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@$(OAPI_CODEGEN_VERSION)

CONTRACT      := contract/openapi.yaml
GEN_GO        := contract/generated/go/types.gen.go
GEN_TS        := contract/generated/ts/api.d.ts

.PHONY: generate generate-go generate-ts check mock frontend

generate: generate-go generate-ts

generate-go: $(CONTRACT)
	@mkdir -p $(dir $(GEN_GO))
	go run $(OAPI_CODEGEN) -package api -generate types -o $(GEN_GO) $(CONTRACT)

generate-ts: $(CONTRACT)
	@mkdir -p $(dir $(GEN_TS))
	cd frontend && npx --no-install openapi-typescript ../$(CONTRACT) -o ../$(GEN_TS)

# Used by CI / before opening a PR: regenerate, then require a clean tree for generated/.
check: generate
	git diff --exit-code -- contract/generated

mock:
	cd mock && go run ./cmd/mockserver

frontend:
	npm --prefix frontend run dev
