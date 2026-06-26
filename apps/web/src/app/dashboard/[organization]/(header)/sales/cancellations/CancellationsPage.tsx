'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { DataTable, DataTableColumnHeader } from '@/components/atoms/datatable'
import { TableEmptyState } from '@/components/atoms/TableEmptyState'
import { Button } from '@/components/ui/button'
import { Download01Icon, FilterIcon, Layers01Icon } from 'hugeicons-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOrganizationSubscriptions } from '@/hooks/queries/subscriptions'
import { useChurnSaveAnalytics } from '@/hooks/queries/analytics'
import { useOrganization } from '@/providers/OrganizationProvider'
import { downloadCSV } from '@/utils/csv'
import { Fragment, useState, useMemo } from 'react'
import type { SortingState } from '@tanstack/react-table'
import { FocusModePanel } from './FocusModePanel'
import { CustomerDrawer, type EnrichedCustomer } from '@/components/Customers/CustomerDrawer'
import type { CancellationRow, FilterState } from './types'
import { EMPTY_FILTERS } from './types'
import { REASON_LABELS, REASON_VARIANTS, formatDate, formatCurrencyShort, calculateTenure } from './utils'

// ── Reason badge ─────────────────────────────────────────────

function ReasonBadge({ reason }: { reason: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
        REASON_VARIANTS[reason] ?? REASON_VARIANTS.other
      }`}
    >
      {REASON_LABELS[reason] ?? reason}
    </span>
  )
}

// ── Stats cards ──────────────────────────────────────────────

function StatsCards({
  total,
  mrrLost,
  currency,
  topReason,
  avgAmount,
}: {
  total: number
  mrrLost: number
  currency: string
  topReason: string | null
  avgAmount: number
}) {
  const cards = [
    { label: 'Churned', value: total.toString(), sub: 'in view' },
    {
      label: 'Revenue Lost',
      value: mrrLost > 0 ? formatCurrencyShort(mrrLost, currency) : '$0',
      sub: 'lifetime',
    },
    {
      label: 'Avg LTV',
      value: avgAmount > 0 ? formatCurrencyShort(avgAmount, currency) : '$0',
      sub: 'per churned account',
    },
    {
      label: 'Top Reason',
      value: topReason ? (REASON_LABELS[topReason] ?? topReason) : '—',
      sub: topReason ? 'most common' : 'no data',
      truncate: true,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl bg-card p-5 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
          <span
            className={`text-2xl font-semibold text-foreground leading-tight ${card.truncate ? 'truncate' : ''}`}
            title={card.truncate ? card.value : undefined}
          >
            {card.value}
          </span>
          <span className="text-[11px] text-muted-foreground/70">{card.sub}</span>
        </div>
      ))}
    </div>
  )
}

// ── Save performance (churn_events analytics) ────────────────

const OFFER_TYPE_LABELS: Record<string, string> = {
  discount: 'Discount',
  pause: 'Pause',
  contact: 'Contact',
  redirect: 'Redirect',
  unknown: 'Other',
}

function SaveRateSection({ organizationId }: { organizationId: string }) {
  const { data } = useChurnSaveAnalytics({ organization_id: organizationId })

  // Hide entirely until the flow has produced events worth showing.
  if (!data || (data.offerShown === 0 && data.canceled === 0)) return null

  const cards = [
    { label: 'Save Rate', value: `${data.saveRate}%`, sub: 'offers accepted vs cancels' },
    { label: 'Offers Shown', value: data.offerShown.toString(), sub: 'in last 90 days' },
    { label: 'Offers Accepted', value: data.offerAccepted.toString(), sub: 'saved subscriptions' },
    { label: 'Offers Declined', value: data.offerDeclined.toString(), sub: 'continued to cancel' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl bg-card p-5 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
            <span className="text-2xl font-semibold text-foreground leading-tight">
              {card.value}
            </span>
            <span className="text-[11px] text-muted-foreground/70">{card.sub}</span>
          </div>
        ))}
      </div>

      {(data.byReason.length > 0 || data.byOfferType.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.byReason.length > 0 && (
            <div className="rounded-xl bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">Save rate by reason</h3>
              <div className="flex flex-col gap-2.5">
                {data.byReason.map((r) => (
                  <div key={r.reason} className="flex items-center gap-3">
                    <span className="text-sm w-36 shrink-0 truncate" title={REASON_LABELS[r.reason] ?? r.reason}>
                      {REASON_LABELS[r.reason] ?? r.reason}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${r.saveRate}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-28 shrink-0 text-right tabular-nums">
                      {r.saveRate}% · {r.offerAccepted}/{r.offerAccepted + r.canceled}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.byOfferType.length > 0 && (
            <div className="rounded-xl bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">Acceptance by offer type</h3>
              <div className="flex flex-col gap-2.5">
                {data.byOfferType.map((o) => (
                  <div key={o.offerType} className="flex items-center gap-3">
                    <span className="text-sm w-28 shrink-0 truncate">
                      {OFFER_TYPE_LABELS[o.offerType] ?? o.offerType}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${o.acceptRate}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-28 shrink-0 text-right tabular-nums">
                      {o.acceptRate}% · {o.offerAccepted}/{o.offerShown}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Filter bar ───────────────────────────────────────────────

function FilterBar({
  isOpen,
  filters,
  setFilters,
  planOptions,
  onClear,
}: {
  isOpen: boolean
  filters: FilterState
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>
  planOptions: string[]
  onClear: () => void
}) {
  const toggleReason = (r: string) =>
    setFilters((p) => ({
      ...p,
      reasons: p.reasons.includes(r) ? p.reasons.filter((x) => x !== r) : [...p.reasons, r],
    }))

  const togglePlan = (plan: string) =>
    setFilters((p) => ({
      ...p,
      plans: p.plans.includes(plan) ? p.plans.filter((x) => x !== plan) : [...p.plans, plan],
    }))

  const INPUT_CLS =
    'w-full px-2.5 py-1.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground'

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="p-4 bg-muted/40 border border-border rounded-xl text-sm mb-2">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
              <button
                onClick={onClear}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Search */}
              <div className="col-span-1 md:col-span-2 lg:col-span-4">
                <label className="block text-xs text-muted-foreground mb-1.5">Search Customer</label>
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={filters.search}
                  onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                  className={INPUT_CLS}
                />
              </div>

              {/* Reasons */}
              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs text-muted-foreground mb-1.5">Reasons</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(REASON_LABELS).map((r) => (
                    <button
                      key={r}
                      onClick={() => toggleReason(r)}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                        filters.reasons.includes(r)
                          ? REASON_VARIANTS[r] ?? REASON_VARIANTS.other
                          : 'bg-background text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {REASON_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plans */}
              {planOptions.length > 0 && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Plan</label>
                  <div className="flex flex-wrap gap-1.5">
                    {planOptions.map((plan) => (
                      <button
                        key={plan}
                        onClick={() => togglePlan(plan)}
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                          filters.plans.includes(plan)
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : 'bg-background text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {plan}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Lifetime Rev Range */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Lifetime Rev Range ($)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.mrrMin}
                    onChange={(e) =>
                      setFilters((p) => ({ ...p, mrrMin: e.target.value ? Number(e.target.value) : '' }))
                    }
                    className={INPUT_CLS}
                  />
                  <span className="text-muted-foreground shrink-0">–</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.mrrMax}
                    onChange={(e) =>
                      setFilters((p) => ({ ...p, mrrMax: e.target.value ? Number(e.target.value) : '' }))
                    }
                    className={INPUT_CLS}
                  />
                </div>
              </div>

              {/* Cancel Date Range */}
              <div className="col-span-1 md:col-span-2">
                <label className="block text-xs text-muted-foreground mb-1.5">Cancel Date</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={filters.cancelDateFrom}
                    onChange={(e) => setFilters((p) => ({ ...p, cancelDateFrom: e.target.value }))}
                    className={INPUT_CLS}
                  />
                  <span className="text-muted-foreground shrink-0 text-xs">to</span>
                  <input
                    type="date"
                    value={filters.cancelDateTo}
                    onChange={(e) => setFilters((p) => ({ ...p, cancelDateTo: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Main component ───────────────────────────────────────────

interface CancellationsPageProps {
  organizationId: string
  organizationSlug: string
  embedded?: boolean
}

export default function CancellationsPage({ organizationId, organizationSlug, embedded = false }: CancellationsPageProps) {
  const { organization } = useOrganization()
  const defaultCurrency = organization.default_currency || 'usd'

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isFocusOpen, setIsFocusOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState<CancellationRow | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])

  const { data: allSubscriptions, isLoading } = useOrganizationSubscriptions(organizationId)

  // Convert API subscriptions to CancellationRow.
  // Include both fully canceled AND end-of-period cancellations (cancel_at_period_end=true)
  // because reason/feedback are saved to metadata immediately when the customer cancels,
  // regardless of timing. End-of-period subs don't reach status='canceled' until the period expires.
  const apiRows = useMemo<CancellationRow[]>(() => {
    if (!allSubscriptions) return []
    return allSubscriptions
      .filter((s) => s.status === 'canceled' || (s.cancel_at_period_end && s.metadata?.cancellation_reason))
      .map((s) => ({
        id: s.id,
        customerName: s.customer?.name || '',
        customerEmail: s.customer?.email || '',
        customerDbId: s.customer?.id || s.customer_id,
        plan: s.product?.name || '',
        reason: s.metadata?.cancellation_reason ?? null,
        notes: s.metadata?.cancellation_feedback ?? null,
        amount: s.amount ?? 0,
        currency: s.currency || defaultCurrency,
        cancelDate: s.canceled_at,
        tenure: calculateTenure(s.created_at, s.canceled_at),
      }))
  }, [allSubscriptions, defaultCurrency])

  // Unique plan options for filter bar
  const planOptions = useMemo(
    () => [...new Set(apiRows.map((r) => r.plan).filter(Boolean))],
    [apiRows],
  )

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.search) count++
    if (filters.reasons.length) count++
    if (filters.plans.length) count++
    if (filters.mrrMin !== '' || filters.mrrMax !== '') count++
    if (filters.cancelDateFrom || filters.cancelDateTo) count++
    return count
  }, [filters])

  const filtered = useMemo<CancellationRow[]>(() => {
    let result = [...apiRows]

    if (filters.search) {
      const q = filters.search.toLowerCase()
      result = result.filter(
        (r) =>
          r.customerName.toLowerCase().includes(q) || r.customerEmail.toLowerCase().includes(q),
      )
    }
    if (filters.reasons.length) {
      result = result.filter((r) => r.reason && filters.reasons.includes(r.reason))
    }
    if (filters.plans.length) {
      result = result.filter((r) => filters.plans.includes(r.plan))
    }
    if (filters.mrrMin !== '') {
      result = result.filter((r) => r.amount >= (filters.mrrMin as number) * 100)
    }
    if (filters.mrrMax !== '') {
      result = result.filter((r) => r.amount <= (filters.mrrMax as number) * 100)
    }
    if (filters.cancelDateFrom) {
      result = result.filter(
        (r) => r.cancelDate && new Date(r.cancelDate) >= new Date(filters.cancelDateFrom),
      )
    }
    if (filters.cancelDateTo) {
      result = result.filter(
        (r) => r.cancelDate && new Date(r.cancelDate) <= new Date(filters.cancelDateTo),
      )
    }

    if (sorting.length > 0) {
      const { id, desc } = sorting[0]
      result.sort((a, b) => {
        let aVal: string | number = ''
        let bVal: string | number = ''
        if (id === 'customer') {
          aVal = a.customerName || a.customerEmail
          bVal = b.customerName || b.customerEmail
        } else if (id === 'plan') {
          aVal = a.plan
          bVal = b.plan
        } else if (id === 'reason') {
          aVal = a.reason ?? ''
          bVal = b.reason ?? ''
        } else if (id === 'cancelDate') {
          aVal = a.cancelDate ? new Date(a.cancelDate).getTime() : 0
          bVal = b.cancelDate ? new Date(b.cancelDate).getTime() : 0
        } else if (id === 'amount') {
          aVal = a.amount
          bVal = b.amount
        }
        if (aVal < bVal) return desc ? 1 : -1
        if (aVal > bVal) return desc ? -1 : 1
        return 0
      })
    }

    return result
  }, [apiRows, filters, sorting])

  const stats = useMemo(() => {
    const total = filtered.length
    const mrrLost = filtered.reduce((sum, r) => sum + r.amount, 0)
    const avgAmount = total > 0 ? Math.round(mrrLost / total) : 0
    const currency = filtered[0]?.currency ?? defaultCurrency
    const reasonCounts: Record<string, number> = {}
    for (const r of filtered) {
      if (r.reason) reasonCounts[r.reason] = (reasonCounts[r.reason] ?? 0) + 1
    }
    const topReason =
      Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return { total, mrrLost, avgAmount, currency, topReason }
  }, [filtered, defaultCurrency])

  const handleExportCSV = () => {
    if (filtered.length === 0) return
    const rows = filtered.map((r) => ({
      'Customer Name': r.customerName,
      'Customer Email': r.customerEmail,
      Plan: r.plan,
      Reason: REASON_LABELS[r.reason ?? ''] ?? r.reason ?? '',
      Notes: r.notes ?? '',
      'Lifetime Rev': formatCurrencyShort(r.amount, r.currency),
      Tenure: r.tenure,
      'Cancel Date': formatDate(r.cancelDate),
    }))
    downloadCSV(rows, `cancellations-${organizationSlug}-${new Date().toISOString().split('T')[0]}.csv`)
  }

  // Build EnrichedCustomer from the selected cancellation row + raw subscriptions
  const drawerCustomer = useMemo<EnrichedCustomer | null>(() => {
    if (!selectedRow || !selectedRow.customerDbId) return null
    const customerSubs = allSubscriptions?.filter(
      (s) => (s.customer?.id ?? s.customer_id) === selectedRow.customerDbId,
    ) ?? []
    const displayName = selectedRow.customerName || selectedRow.customerEmail
    return {
      id: selectedRow.customerDbId,
      name: selectedRow.customerName || selectedRow.customerEmail,
      email: selectedRow.customerEmail,
      country: '',
      created_at: customerSubs[0]?.created_at ?? '',
      avatarInitial: displayName.charAt(0).toUpperCase(),
      planName: selectedRow.plan || null,
      subscriptionStatus: 'canceled',
      mrr: selectedRow.amount,
      churnRisk: 'Churned',
      cancelAtPeriodEnd: false,
      primarySubscriptionId: selectedRow.id,
      subscriptions: customerSubs,
      pendingDowngrade: null,
    }
  }, [selectedRow, allSubscriptions])

  const Wrapper = embedded ? Fragment : DashboardBody

  return (
    <Wrapper>
      <div className="flex flex-col gap-y-6">
        {/* Header */}
        <div
          className={`flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            embedded ? '' : 'pb-4 border-b border-border'
          }`}
        >
          {!embedded && (
            <div>
              <h1 className="text-2xl font-semibold">Churn</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Track why customers cancel and identify churn patterns
              </p>
            </div>
          )}

          <div className={`flex items-center gap-1.5 ${embedded ? 'md:ml-auto' : ''}`}>
            {/* Filters button */}
            <button
              onClick={() => setIsFilterOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                isFilterOpen || activeFilterCount > 0
                  ? 'bg-muted border-border text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <FilterIcon size={15} />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 text-[10px] font-medium text-white bg-primary rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Focus mode */}
            <button
              onClick={() => setIsFocusOpen(true)}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Layers01Icon size={15} />
              Focus
            </button>

            <span className="text-xs text-muted-foreground ml-2 pl-2 border-l border-border">
              {filtered.length} entries
            </span>
          </div>
        </div>

        <StatsCards
          total={stats.total}
          mrrLost={stats.mrrLost}
          currency={stats.currency}
          topReason={stats.topReason}
          avgAmount={stats.avgAmount}
        />

        <SaveRateSection organizationId={organizationId} />

        <FilterBar
          isOpen={isFilterOpen}
          filters={filters}
          setFilters={setFilters}
          planOptions={planOptions}
          onClear={() => setFilters(EMPTY_FILTERS)}
        />

        {/* Export row */}
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" className="gap-x-2" onClick={handleExportCSV}>
            <Download01Icon size={16} />
            Export CSV
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <DataTable
            data={filtered}
            isLoading={isLoading}
            sorting={sorting}
            onSortingChange={setSorting}
            rowCount={filtered.length}
            emptyState={
              <TableEmptyState
                title="No cancellations yet"
                description={
                  activeFilterCount > 0
                    ? 'No results match your current filters.'
                    : 'Churned customers will appear here once someone cancels.'
                }
                action={
                  activeFilterCount > 0
                    ? { label: 'Clear filters', onClick: () => setFilters(EMPTY_FILTERS) }
                    : undefined
                }
              />
            }
            columns={[
              {
                id: 'customer',
                accessorKey: 'customerName',
                size: 200,
                header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
                cell: ({ row: { original: r } }) => {
                  const displayName = r.customerName || r.customerEmail
                  const initial = displayName?.charAt(0).toUpperCase() || '?'
                  return (
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {initial}
                      </div>
                      <div className="flex flex-col truncate">
                        <div className="truncate text-sm font-medium">{displayName}</div>
                        {r.customerName && (
                          <div className="truncate text-xs text-muted-foreground">{r.customerEmail}</div>
                        )}
                      </div>
                    </div>
                  )
                },
              },
              {
                id: 'plan',
                accessorKey: 'plan',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Plan" />,
                cell: ({ row: { original: r } }) => (
                  <span className="text-sm font-medium">{r.plan || '—'}</span>
                ),
              },
              {
                id: 'reason',
                accessorKey: 'reason',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Reason" />,
                cell: ({ row: { original: r } }) =>
                  r.reason ? (
                    <ReasonBadge reason={r.reason} />
                  ) : (
                    <span className="text-muted-foreground/50 text-sm">—</span>
                  ),
              },
              {
                id: 'notes',
                header: () => <span className="text-xs font-medium text-muted-foreground">Notes</span>,
                cell: ({ row: { original: r } }) =>
                  r.notes ? (
                    <span className="text-sm text-muted-foreground line-clamp-2 max-w-[240px]">{r.notes}</span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  ),
              },
              {
                id: 'amount',
                accessorKey: 'amount',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Lifetime Rev" />,
                cell: ({ row: { original: r } }) => (
                  <span className="text-sm text-muted-foreground">
                    {formatCurrencyShort(r.amount, r.currency)}
                  </span>
                ),
              },
              {
                id: 'tenure',
                accessorKey: 'tenure',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Tenure" />,
                cell: ({ row: { original: r } }) => (
                  <span className="text-sm text-muted-foreground">{r.tenure}</span>
                ),
              },
              {
                id: 'cancelDate',
                accessorKey: 'cancelDate',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Cancel Date" />,
                cell: ({ row: { original: r } }) => (
                  <span className="text-sm text-muted-foreground">{formatDate(r.cancelDate)}</span>
                ),
              },
              {
                id: 'actions',
                header: () => null,
                cell: ({ row: { original: r } }) =>
                  r.customerDbId ? (
                    <span className="flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedRow(r)}
                      >
                        View Customer
                      </Button>
                    </span>
                  ) : null,
              },
            ]}
          />
        </div>
      </div>

      <FocusModePanel
        data={filtered}
        isOpen={isFocusOpen}
        onClose={() => setIsFocusOpen(false)}
      />

      <CustomerDrawer
        customer={drawerCustomer}
        organizationId={organizationId}
        open={!!selectedRow}
        onClose={() => setSelectedRow(null)}
      />
    </Wrapper>
  )
}
