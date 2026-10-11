import { useMemo, useState } from 'react'
import { useCosts, useCostsSummary, useInstruments, useMarkets, usePnl, useTrades } from '../../api'
import { Banner, Button, Card, EmptyState, Field, SegmentedToggle, SkeletonText, TopBar } from '../../components'
import { getAccountId } from '../../lib/account'
import type { PriceFormat } from '../../lib/ticks'
import { PnlSummaryCard } from './PnlSummaryCard'
import { QueryError } from './QueryError'
import { TaxSection } from './TaxSection'
import { TradesTable } from './TradesTable'
import { beforeForRange, defaultRange, formatDay, isDateStr, isOnOrAfter, lowerBound, type DateStr } from './range'

type Tab = 'history' | 'tax'
interface Range {
  from: DateStr
  to: DateStr
}

const TABS = [
  { value: 'history' as const, label: 'Trade history' },
  { value: 'tax' as const, label: 'Tax' },
]

/**
 * Record: closed trades, the P&L summary and the tax/cost breakdown. Live sessions only —
 * practice is never recorded. Durable reads: 200 even when empty, no session needed.
 *
 * Layout and flow follow the app board (docs/design/App.dc.html, "Record"): header, pill tabs,
 * a From/To filter with Submit, then the results card(s). The date range is applied with the
 * contract's keyset cursor (see range.ts); the contract has no from/to parameters.
 */
export default function RecordPage() {
  const accountId = getAccountId()
  const markets = useMarkets()
  const [marketCode, setMarketCode] = useState<string>('')
  const [tab, setTab] = useState<Tab>('history')
  const [draft, setDraft] = useState<Range | null>(null)
  const [applied, setApplied] = useState<Range | null>(null)

  const marketList = markets.data?.markets ?? []
  const market = marketList.find((m) => m.code === marketCode) ?? marketList[0]
  const tz = market?.timezone
  const country = market?.code // the contract's `country` param is the market code (IN | US)

  // Until the user submits, the applied range is the default (last 30 market days).
  const defaults = useMemo(() => (tz ? defaultRange(tz) : null), [tz])
  const range = applied ?? defaults
  const draftRange = draft ?? defaults

  return (
    <div className="min-h-screen bg-bg text-ink">
      <TopBar
        markets={marketList.map((m) => ({ code: m.code, name: m.name }))}
        market={market?.code ?? ''}
        onMarketChange={setMarketCode}
        marketsLoading={markets.isPending}
        accountLabel={accountId}
        accountItems={[
          { label: 'Home', onSelect: () => window.location.assign('/') },
          { label: 'Terminal', onSelect: () => window.location.assign('/terminal') },
          { label: 'Record', onSelect: () => {} },
        ]}
      />
      <main className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 pb-16 pt-6 sm:px-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Record</h1>
          <p className="text-muted">Live sessions only. Practice is never recorded.</p>
        </div>

        <SegmentedToggle<Tab> label="Record" options={TABS} value={tab} onChange={setTab} className="self-start" />

        {markets.isError ? (
          <QueryError title="Could not load markets" error={markets.error} onRetry={() => void markets.refetch()} />
        ) : !market || !tz || !range || !draftRange || !country ? (
          <Card><SkeletonText lines={4} label="Loading" /></Card>
        ) : (
          <RecordBody
            key={market.code}
            accountId={accountId}
            tab={tab}
            marketName={market.name}
            country={country}
            tz={tz}
            draft={draftRange}
            applied={range}
            onDraft={setDraft}
            onSubmit={() => setApplied(draftRange)}
          />
        )}
      </main>
    </div>
  )
}

function RecordBody(props: {
  accountId: string
  tab: Tab
  marketName: string
  country: string
  tz: string
  draft: Range
  applied: Range
  onDraft: (r: Range) => void
  onSubmit: () => void
}) {
  const { accountId, tab, marketName, country, tz, draft, applied } = props

  const before = beforeForRange(applied.to, tz)
  const bound = lowerBound(applied.from, tz)
  const pending = draft.from !== applied.from || draft.to !== applied.to
  const fromOk = isDateStr(draft.from)
  const toOk = isDateStr(draft.to)
  const orderOk = fromOk && toOk && draft.from <= draft.to
  const countryParam = country === 'US' ? 'US' : 'IN' // only IN is implemented; US is sent and answered 501

  // Pages are always fetched by the contract's cursor; rows outside the range are dropped here.
  const trades = useTrades(accountId, before)
  const pnl = usePnl(accountId)
  const instruments = useInstruments(country)
  const costs = useCosts(accountId, countryParam, before, tab === 'tax')
  const costsSummary = useCostsSummary(accountId, countryParam, tab === 'tax')

  const fmtBySymbol = useMemo(() => {
    const m = new Map<string, PriceFormat>()
    for (const i of instruments.data?.instruments ?? []) m.set(i.instrument, { tick_size: i.tick_size, price_decimals: i.price_decimals })
    return m
  }, [instruments.data])

  const allTrades = useMemo(() => trades.data?.pages.flatMap((p) => p.trades) ?? [], [trades.data])
  const tradesInRange = useMemo(() => allTrades.filter((t) => isOnOrAfter(t.exit_at, bound)), [allTrades, bound])
  const tradesById = useMemo(() => new Map(allTrades.map((t) => [t.trade_id, t])), [allTrades])

  // Walk older pages only while the oldest loaded trade is still inside the range.
  const lastTrade = allTrades[allTrades.length - 1]
  const moreTrades = !!trades.hasNextPage && (!lastTrade || isOnOrAfter(lastTrade.exit_at, bound))

  const allCosts = useMemo(() => costs.data?.pages.flatMap((p) => p.trades) ?? [], [costs.data])
  const costsInRange = useMemo(
    () => allCosts.filter((c) => {
      const t = tradesById.get(c.trade_id)
      return !t || isOnOrAfter(t.exit_at, bound)
    }),
    [allCosts, tradesById, bound],
  )
  const lastCost = allCosts[allCosts.length - 1]
  const lastCostTrade = lastCost ? tradesById.get(lastCost.trade_id) : undefined
  const moreCosts = !!costs.hasNextPage && (!lastCostTrade || isOnOrAfter(lastCostTrade.exit_at, bound))

  // The cost rows carry only a trade id; keep the trades list one page ahead so each row can
  // show its date and symbol (both lists share the same cursor ordering).
  const loadMoreTax = () => {
    void costs.fetchNextPage()
    if (trades.hasNextPage) void trades.fetchNextPage()
  }

  const fmtFor = (symbol: string) => fmtBySymbol.get(symbol) ?? null

  return (
    <>
      {tab === 'history' && <PnlSummaryCard query={pnl} />}

      <Card flush aria-label="Date range">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 p-4 sm:px-5">
          <Field
            label="From"
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            error={fromOk && toOk && !orderOk ? 'From must be on or before To' : undefined}
            onChange={(e) => props.onDraft({ ...draft, from: e.target.value })}
            className="min-w-[10rem] flex-1 sm:max-w-[14rem]"
          />
          <Field
            label="To"
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => props.onDraft({ ...draft, to: e.target.value })}
            className="min-w-[10rem] flex-1 sm:max-w-[14rem]"
          />
          <Button variant="primary" disabled={!orderOk || !pending} onClick={props.onSubmit}>
            Submit
          </Button>
        </div>
      </Card>

      {pending ? (
        <Card>
          <EmptyState icon="…" title="Dates changed" description="Press Submit to update the results." />
        </Card>
      ) : tab === 'history' ? (
        trades.isError ? (
          <QueryError title="Could not load your trades" error={trades.error} onRetry={() => void trades.refetch()} />
        ) : trades.isPending || instruments.isPending ? (
          <Card><SkeletonText lines={6} label="Loading trades" /></Card>
        ) : tradesInRange.length === 0 ? (
          <Card>
            <EmptyState
              title="No closed trades in this period"
              description={`No closed live trades in ${marketName} between ${formatDay(applied.from, tz)} and ${formatDay(applied.to, tz)}.`}
            />
          </Card>
        ) : (
          <>
            {instruments.isError && (
              <Banner tone="warn" title="Prices are hidden">
                Could not load the {marketName} instrument list, which sets how prices are shown. Quantities and P&amp;L are unaffected.
              </Banner>
            )}
          <TradesTable
            trades={tradesInRange}
            fmtFor={fmtFor}
            tz={tz}
            marketName={marketName}
            hasMore={moreTrades}
            loadingMore={trades.isFetchingNextPage}
            onLoadMore={() => void trades.fetchNextPage()}
          />
          </>
        )
      ) : (
        <TaxSection
          marketName={marketName}
          country={country}
          tz={tz}
          summary={costsSummary}
          pnl={pnl}
          costs={costs}
          tradesById={tradesById}
          rows={costsInRange}
          hasMore={moreCosts}
          loadingMore={costs.isFetchingNextPage || trades.isFetchingNextPage}
          onLoadMore={loadMoreTax}
        />
      )}
    </>
  )
}
