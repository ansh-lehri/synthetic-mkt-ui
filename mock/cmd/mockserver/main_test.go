package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	api "github.com/ansh-2505-lehri/synthetic-mkt-ui/contract/generated/go"
	"github.com/gorilla/websocket"
)

func TestRoutes(t *testing.T) {
	srv := httptest.NewServer(newHandler())
	defer srv.Close()

	cases := []struct {
		name, method, path, body string
		want                     int
	}{
		{"markets", "GET", "/v1/markets", "", 200},
		{"instruments", "GET", "/v1/instruments?market=IN", "", 200},
		{"instruments missing market", "GET", "/v1/instruments", "", 400},
		{"session", "GET", "/v1/session?account_id=a1", "", 200},
		{"join live", "POST", "/v1/session/live/join", `{"account_id":"a1","market":"IN"}`, 200},
		{"practice start", "POST", "/v1/session/practice/start", `{"account_id":"a1","market":"IN","condition":"whipsaw","length_minutes":60}`, 200},
		{"practice bad length", "POST", "/v1/session/practice/start", `{"account_id":"a1","market":"IN","condition":"whipsaw","length_minutes":10}`, 400},
		{"exit", "POST", "/v1/session/exit", `{"account_id":"a1"}`, 200},
		{"place limit", "POST", "/v1/orders", `{"account_id":"a1","instrument":"ACME","side":"buy","type":"limit","tif":"gtc","qty":5,"limit_price":10050}`, 202},
		{"place market rejects", "POST", "/v1/orders", `{"account_id":"a1","instrument":"ACME","side":"buy","type":"market","tif":"ioc","qty":5}`, 422},
		{"place bad json", "POST", "/v1/orders", `{`, 400},
		{"place wrong method", "GET", "/v1/orders", "", 405},
		{"cancel", "POST", "/v1/orders/cancel", `{"account_id":"a1","order_id":"a1:3"}`, 202},
		{"cancel foreign order", "POST", "/v1/orders/cancel", `{"account_id":"a1","order_id":"b2:3"}`, 409},
		{"modify", "POST", "/v1/orders/modify", `{"account_id":"a1","order_id":"a1:3","instrument":"ACME","side":"buy","is_market":false,"new_qty":5,"new_price":10055}`, 200},
		{"transfer", "POST", "/v1/account/transfer", `{"account_id":"a1","direction":"to_bank","amount":100}`, 200},
		{"balance", "GET", "/v1/account/balance?account_id=a1", "", 200},
		{"balance missing account", "GET", "/v1/account/balance", "", 400},
		{"positions", "GET", "/v1/account/positions?account_id=a1", "", 200},
		{"positions flat filter", "GET", "/v1/account/positions?account_id=a1&instrument=ZZZZ", "", 200},
		{"orders", "GET", "/v1/account/orders?account_id=a1", "", 200},
		{"observation", "GET", "/v1/account/observation?account_id=a1", "", 200},
		{"trades", "GET", "/v1/account/trades?account_id=a1", "", 200},
		{"pnl", "GET", "/v1/account/pnl?account_id=a1", "", 200},
		{"costs IN", "GET", "/v1/account/costs?account_id=a1&country=IN", "", 200},
		{"costs US is 501", "GET", "/v1/account/costs?account_id=a1&country=US", "", 501},
		{"costs lowercase country", "GET", "/v1/account/costs?account_id=a1&country=in", "", 400},
		{"costs summary IN", "GET", "/v1/account/costs/summary?account_id=a1&country=IN", "", 200},
		{"costs summary US is 501", "GET", "/v1/account/costs/summary?account_id=a1&country=US", "", 501},
		{"candles", "GET", "/v1/candles?market=IN&instrument=ACME&timeframe=5m&from=2026-10-09T09:15:00&to=2026-10-09T10:15:00", "", 200},
		{"candles bad timeframe", "GET", "/v1/candles?market=IN&instrument=ACME&timeframe=2m&from=2026-10-09T09:15:00&to=2026-10-09T10:15:00", "", 400},
		{"unknown route", "GET", "/v1/nope", "", 404},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(tc.method, srv.URL+tc.path, strings.NewReader(tc.body))
			if err != nil {
				t.Fatal(err)
			}
			if tc.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.want {
				t.Fatalf("%s %s: got %d, want %d", tc.method, tc.path, resp.StatusCode, tc.want)
			}
			if got := resp.Header.Get("Content-Type"); !strings.HasPrefix(got, "application/json") {
				t.Fatalf("Content-Type = %q, want application/json", got)
			}
			if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "*" {
				t.Fatalf("missing CORS header, got %q", got)
			}
		})
	}
}

func TestWSSendsConnected(t *testing.T) {
	srv := httptest.NewServer(newHandler())
	defer srv.Close()

	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	var msg api.WsConnected
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("read: %v", err)
	}
	if msg.Type != api.WsTypeConnected || msg.Market != "IN" || msg.Timezone != "Asia/Kolkata" {
		t.Fatalf("unexpected connected frame: %+v", msg)
	}
}
