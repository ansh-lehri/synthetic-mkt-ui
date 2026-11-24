import { useState } from 'react'
import {
  Banner,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  DepthLadder,
  EmptyState,
  Field,
  Num,
  OrderTicket,
  Panel,
  SessionBar,
  Skeleton,
  SkeletonText,
  Spinner,
  TabStrip,
  ThemeToggle,
  TopBar,
  type OrderDraft,
  type TicketFeedback,
} from '../../components'
import type { PriceFormat } from '../../lib/ticks'

// Static props only — this page makes no API calls. Values mirror contract examples
// (raw int64; ACME tick_size 5, 2 decimals; money raw minor units).
const FMT: PriceFormat = { tick_size: 5, price_decimals: 2 }
const INSTRUMENT = { symbol: 'SYNTH_DEF', tick_size: 5, price_decimals: 2, lot_size: 1 }
const MARKETS = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
]
const BIDS = [
  { price: 10085, qty: 300 },
  { price: 10080, qty: 520 },
  { price: 10075, qty: 140 },
  { price: 10070, qty: 880 },
  { price: 10065, qty: 60 },
]
const ASKS = [
  { price: 10095, qty: 150 },
  { price: 10100, qty: 410 },
  { price: 10105, qty: 90 },
  { price: 10110, qty: 700 },
  { price: 10115, qty: 230 },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}

/** Every component, once. Rendered per theme by <KitPage/>. */
function KitSections() {
  const [market, setMarket] = useState('IN')
  const [tab, setTab] = useState('positions')
  const [chip, setChip] = useState('whipsaw')
  const [confirm, setConfirm] = useState(false)
  const [exited, setExited] = useState(false)
  const [qty, setQty] = useState('10')
  const [feedback, setFeedback] = useState<TicketFeedback | undefined>()
  const [last, setLast] = useState<OrderDraft | undefined>()
  const [dismissed, setDismissed] = useState(false)

  return (
    <div className="space-y-8">
      <Section title="TopBar">
        <div className="overflow-hidden rounded-lg border border-line">
          <TopBar
            markets={MARKETS}
            market={market}
            onMarketChange={setMarket}
            accountLabel="acct-1042"
            accountItems={[
              { label: 'Account', onSelect: () => {} },
              { label: 'Record', onSelect: () => {} },
              { label: 'Sign out', onSelect: () => {} },
            ]}
          />
        </div>
      </Section>

      <Section title="SessionBar">
        <div className="space-y-3">
          <SessionBar mode="live" market="India" phase="open" clock="10:42:15" timezone="Asia/Kolkata" onExit={() => setExited(true)} />
          <SessionBar mode="practice" market="India" phase="closing" clock="15:18:02" timezone="Asia/Kolkata" condition="Whipsaw" onExit={() => setExited(true)} />
          {exited && <Banner tone="info" onDismiss={() => setExited(false)}>Exit confirmed (demo only — nothing was sent).</Banner>}
        </div>
      </Section>

      <Section title="Button">
        <Row>
          <Button variant="primary">Primary</Button>
          <Button variant="buy">Buy</Button>
          <Button variant="sell">Sell</Button>
          <Button variant="exit">Exit</Button>
          <Button variant="ghost">Ghost</Button>
        </Row>
        <Row>
          <Button variant="primary" disabled>Disabled</Button>
          <Button variant="buy" loading>Placing…</Button>
          <Button variant="primary" capability={{ enabled: false, reason: 'Market orders are not available yet.' }}>
            Market (gated)
          </Button>
        </Row>
      </Section>

      <Section title="Num — colour paired with ▲/▼ and +/−">
        <Card>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">price</dt><dd><Num kind="price" value={10090} fmt={FMT} /></dd>
            <dt className="text-muted">price-change +</dt><dd><Num kind="price-change" value={25} fmt={FMT} /></dd>
            <dt className="text-muted">price-change −</dt><dd><Num kind="price-change" value={-110} fmt={FMT} /></dd>
            <dt className="text-muted">money</dt><dd><Num kind="money" value={12345678} /></dd>
            <dt className="text-muted">money (negative)</dt><dd><Num kind="money" value={-150000} /></dd>
            <dt className="text-muted">signed-money +</dt><dd><Num kind="signed-money" value={418800} /></dd>
            <dt className="text-muted">signed-money −</dt><dd><Num kind="signed-money" value={-31200} /></dd>
            <dt className="text-muted">signed-money 0</dt><dd><Num kind="signed-money" value={0} /></dd>
            <dt className="text-muted">percent +</dt><dd><Num kind="percent" value={1.37} /></dd>
            <dt className="text-muted">percent −</dt><dd><Num kind="percent" value={-0.5} /></dd>
            <dt className="text-muted">percent ~0</dt><dd><Num kind="percent" value={0.001} /></dd>
            <dt className="text-muted">qty</dt><dd><Num kind="qty" value={1234567} /></dd>
            <dt className="text-muted">has_bid=false</dt><dd><Num kind="price" value={0} fmt={FMT} available={false} /></dd>
            <dt className="text-muted">large</dt><dd><Num kind="signed-money" value={418800} size="lg" /></dd>
          </dl>
        </Card>
      </Section>

      <Section title="Chip">
        <Row>
          {['normal', 'thin', 'calm', 'busy', 'dispersion'].map((c) => (
            <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>
              {c.replace('_', ' ')}
            </Chip>
          ))}
        </Row>
      </Section>

      <Section title="Field">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quantity" numeric value={qty} onChange={(e) => setQty(e.target.value)} hint="Whole numbers" />
          <Field label="Limit price" numeric defaultValue="100.52" error="Must be a multiple of 0.05" />
          <Field label="Email" type="email" placeholder="you@example.com" />
          <Field label="Amount" numeric suffix={<span className="pr-3">units</span>} defaultValue="1,000.00" />
        </div>
      </Section>

      <Section title="Spinner / Skeleton">
        <Row>
          <Spinner label="Loading balance" />
          <Skeleton className="h-8 w-40" />
        </Row>
        <SkeletonText lines={3} />
      </Section>

      <Section title="Banner / Panel">
        <div className="space-y-2">
          <Banner tone="info" title="Practice session">Results are not recorded.</Banner>
          <Banner tone="warn" title="Trading halted">Orders are paused until the market reopens.</Banner>
          <Banner tone="error" title="Could not reach the server">Check your connection and try again.</Banner>
          <Banner tone="success" title="Transfer complete" action={<Button variant="ghost">View</Button>} />
          {!dismissed && <Banner tone="info" onDismiss={() => setDismissed(true)}>Dismissible banner.</Banner>}
          <Panel tone="warn" title="Market closed" action={<Button variant="ghost">See schedule</Button>}>
            The India market is closed. The next live session opens at 09:15.
          </Panel>
        </div>
      </Section>

      <Section title="Card / TabStrip / EmptyState">
        <Card title="Account" actions={<Button variant="ghost">Refresh</Button>} flush>
          <TabStrip
            activeId={tab}
            onChange={setTab}
            tabs={[
              { id: 'positions', label: 'Positions', count: 1 },
              { id: 'orders', label: 'Open orders', count: 0 },
              { id: 'trades', label: 'Trades', status: 'degraded' },
              { id: 'pnl', label: 'Session P&L' },
            ]}
          >
            {tab === 'positions' && (
              <div className="p-4 text-sm">
                <div className="flex justify-between"><span>SYNTH_DEF · qty <Num kind="qty" value={10} /></span><span className="text-muted">avg <Num kind="price" value={10050} fmt={FMT} /></span></div>
              </div>
            )}
            {tab === 'orders' && <EmptyState title="No open orders" description="Orders you place appear here while they work." />}
            {tab === 'trades' && <EmptyState degraded title="Recent trades unavailable" description="Your balance and positions are still live. Trades will return shortly." />}
            {tab === 'pnl' && <div className="p-4"><Num kind="signed-money" value={418800} size="lg" /></div>}
          </TabStrip>
        </Card>
      </Section>

      <Section title="DepthLadder">
        <Card flush>
          <DepthLadder fmt={FMT} bids={BIDS} asks={ASKS} hasBid hasAsk lastPrice={10090} hasLast />
        </Card>
        <Card flush title="No ask side (has_ask=false)">
          <DepthLadder fmt={FMT} bids={BIDS} asks={[]} hasBid hasAsk={false} lastPrice={10090} hasLast />
        </Card>
      </Section>

      <Section title="OrderTicket">
        <OrderTicket
          instrument={INSTRUMENT}
          marketOrders={{ enabled: false, reason: 'Market orders are not available yet.' }}
          buyingPower={9500000}
          lastPrice={10090}
          hasLast
          feedback={feedback}
          onSubmit={(d) => {
            setLast(d)
            setFeedback({ kind: 'accepted', message: `${d.side} ${d.qty} ${d.instrument} submitted.` })
          }}
        />
        {last && <pre className="overflow-x-auto rounded-md border border-line bg-raised p-3 text-xs">{JSON.stringify(last)}</pre>}
        <Row>
          <Button variant="ghost" onClick={() => setFeedback({ kind: 'rejected', message: 'Rejected: insufficient_funds.' })}>Show reject</Button>
          <Button variant="ghost" onClick={() => setFeedback({ kind: 'partial', message: '4 of 10 filled; the rest is still working.' })}>Show partial</Button>
        </Row>
      </Section>

      <Section title="ConfirmDialog">
        <Button variant="ghost" onClick={() => setConfirm(true)}>Open dialog</Button>
        <ConfirmDialog
          open={confirm}
          tone="danger"
          title="Leave this session?"
          description="You can only be in one session at a time."
          confirmLabel="Leave"
          onCancel={() => setConfirm(false)}
          onConfirm={() => setConfirm(false)}
        />
      </Section>
    </div>
  )
}

/** /kit — every shared component, pinned in Night and Lab side by side. Static props, no API calls. */
export default function KitPage() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-3">
        <h1 className="text-base font-semibold">Component kit</h1>
        <span className="text-sm text-muted">Each column is pinned to its theme. The toggle changes the page theme.</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <div className="grid gap-0 lg:grid-cols-2">
        {(['night', 'lab'] as const).map((theme) => (
          <div key={theme} data-theme={theme} data-testid={`kit-${theme}`} className="min-w-0 bg-bg px-4 py-6 text-ink">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">{theme === 'night' ? 'Night' : 'Lab'}</p>
            <KitSections />
          </div>
        ))}
      </div>
    </div>
  )
}
