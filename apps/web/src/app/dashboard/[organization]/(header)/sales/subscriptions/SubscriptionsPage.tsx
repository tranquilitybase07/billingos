'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { SubscriptionStatus } from '@/components/Subscriptions/SubscriptionStatus'
import { PendingChangeBadge } from '@/components/Subscriptions/PendingChangeBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useMRR } from '@/hooks/queries/analytics'
import Link from 'next/link'
import { useState, useMemo } from 'react'
import { useProducts } from '@/hooks/queries/products'
import { useOrganizationSubscriptions } from '@/hooks/queries/subscriptions'
import { downloadCSV } from '@/utils/csv'
import { formatCurrency } from '@/utils/metrics'
import { Download01Icon } from 'hugeicons-react'
import { MiniMetricChartBox } from '@/components/Metrics/MiniMetricChartBox'
import { PillTabs, PillTabsList, PillTabsTrigger } from '@/components/atoms/PillTabs'
import { FilterDropdown } from '@/components/atoms/FilterDropdown'
import { SortDropdown } from '@/components/atoms/SortDropdown'
import { SearchInput } from '@/components/atoms/SearchInput'
import { ActiveFiltersBar, type ActiveFilter } from '@/components/atoms/ActiveFiltersBar'
import { TableEmptyState } from '@/components/atoms/TableEmptyState'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ── KPI Cards ──────────────────────────────────────────────

interface SubscriptionStatsCardsProps {
  mrr: number
  activeSubscriptions: number
  trialConversionRate: number
  nrr: number
  currency: string
}

function SubscriptionStatsCards({ mrr, activeSubscriptions, trialConversionRate, nrr, currency }: SubscriptionStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <MiniMetricChartBox title="MRR" value={mrr} type="currency" currency={currency} />
      <MiniMetricChartBox title="Active Subscriptions" value={activeSubscriptions} type="scalar" />
      <MiniMetricChartBox title="Trial Conversion" value={trialConversionRate} type="percentage" />
      <MiniMetricChartBox title="Net Revenue Retention" value={nrr} type="percentage" />
    </div>
  )
}

// ── Types ──────────────────────────────────────────────────

type StatusTab = 'All' | 'Active' | 'Trialing' | 'Canceled'
type SortOption = 'Newest' | 'Oldest' | 'Renewal soonest' | 'A-Z'

interface SubscriptionsPageProps {
  organizationId: string
  organizationSlug: string
  productIdFilter?: string
  statusFilter?: string
}

// ── Component ──────────────────────────────────────────────

const STATUS_FILTER_TO_TAB: Record<string, StatusTab> = {
  active: 'Active',
  trialing: 'Trialing',
  canceled: 'Canceled',
}

export default function SubscriptionsPage({
  organizationId,
  organizationSlug,
  productIdFilter,
  statusFilter,
}: SubscriptionsPageProps) {
  const { organization } = useOrganization()
  const orgCurrency = organization.default_currency || 'usd'

  const [statusTab, setStatusTab] = useState<StatusTab>(
    (statusFilter && STATUS_FILTER_TO_TAB[statusFilter]) || 'All',
  )
  const [search, setSearch] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<string[]>(
    productIdFilter ? [productIdFilter] : [],
  )
  const [sortOrder, setSortOrder] = useState<SortOption>('Newest')

  const { data: productsResponse, isLoading: isLoadingProducts } = useProducts(organizationId)
  const { data: subscriptions, isLoading: isLoadingSubscriptions } = useOrganizationSubscriptions(organizationId)
  const { data: mrrData } = useMRR(organizationId)

  const productsList = productsResponse?.items ?? []

  const counts = useMemo(() => {
    const all = subscriptions ?? []
    return {
      All:      all.length,
      Active:   all.filter((s) => s.status === 'active').length,
      Trialing: all.filter((s) => s.status === 'trialing').length,
      Canceled: all.filter((s) => s.status === 'canceled').length,
    }
  }, [subscriptions])

  const subscriptionStats = useMemo(() => {
    if (!subscriptions) return { activeCount: 0, trialConversionRate: 0, nrr: 0 }
    const active = subscriptions.filter((s) => s.status === 'active' && !s.cancel_at_period_end).length
    const trialing = subscriptions.filter((s) => s.status === 'trialing').length
    const trialConversionRate = active + trialing > 0 ? (active / (active + trialing)) * 100 : 0
    return { activeCount: active, trialConversionRate, nrr: 0 }
  }, [subscriptions])

  const removeProduct = (id: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p !== id))
  }

  const clearAllFilters = () => {
    setStatusTab('All')
    setSearch('')
    setSelectedProducts([])
  }

  const activeFilters: ActiveFilter[] = [
    ...(statusTab !== 'All'
      ? [{ id: 'status', label: `Status: ${statusTab}`, onRemove: () => setStatusTab('All') }]
      : []),
    ...(search
      ? [{ id: 'search', label: `Search: ${search}`, onRemove: () => setSearch('') }]
      : []),
    ...selectedProducts.map((id) => {
      const p = productsList.find((p) => p.id === id)
      return {
        id: `product-${id}`,
        label: `Product: ${p?.name ?? id}`,
        onRemove: () => removeProduct(id),
      }
    }),
  ]
  const hasActiveFilters = activeFilters.length > 0

  const filteredSubscriptions = useMemo(() => {
    if (!subscriptions) return []

    let result = subscriptions.filter((sub) => {
      if (statusTab === 'Active' && sub.status !== 'active') return false
      if (statusTab === 'Trialing' && sub.status !== 'trialing') return false
      if (statusTab === 'Canceled' && sub.status !== 'canceled') return false

      if (selectedProducts.length > 0 && !selectedProducts.includes(sub.product_id)) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const name = sub.customer?.name?.toLowerCase() ?? ''
        const email = sub.customer?.email?.toLowerCase() ?? ''
        if (!name.includes(q) && !email.includes(q)) return false
      }

      return true
    })

    result = [...result].sort((a, b) => {
        if (sortOrder === 'Newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        if (sortOrder === 'Oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        if (sortOrder === 'Renewal soonest') {
          const aEnd = a.current_period_end ? new Date(a.current_period_end).getTime() : Infinity
          const bEnd = b.current_period_end ? new Date(b.current_period_end).getTime() : Infinity
          return aEnd - bEnd
        }
        if (sortOrder === 'A-Z') {
          const nameA = a.customer?.name || a.customer?.email || ''
          const nameB = b.customer?.name || b.customer?.email || ''
          return nameA.localeCompare(nameB)
        }
        return 0
      })

    return result
  }, [subscriptions, statusTab, selectedProducts, search, sortOrder])

  const handleExportCSV = () => {
    if (filteredSubscriptions.length === 0) return
    const exportData = filteredSubscriptions.map((sub) => {
      const product = productsList.find((p) => p.id === sub.product_id)
      return {
        'Customer Name': sub.customer?.name || '',
        'Customer Email': sub.customer?.email || '',
        Status: sub.status,
        Plan: product?.name || 'Unknown',
        Amount: formatCurrency(sub.amount, sub.currency),
        Started: formatDate(sub.created_at),
        Renews: sub.current_period_end ? formatDate(sub.current_period_end) : '',
      }
    })
    downloadCSV(exportData, `subscriptions-${organizationSlug}-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const STATUS_TABS: StatusTab[] = ['All', 'Active', 'Trialing', 'Canceled']
  const SORT_OPTIONS = ['Newest', 'Oldest', 'Renewal soonest', 'A-Z'] as const satisfies readonly SortOption[]
  const productOptions = productsList.map((p) => ({ value: p.id, label: p.name }))

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Subscriptions</h1>
          <p className="text-muted-foreground">Track subscription status, renewals, and retention metrics</p>
        </div>

        {/* Stats Cards */}
        <SubscriptionStatsCards
          mrr={mrrData?.mrr ?? 0}
          activeSubscriptions={subscriptionStats.activeCount}
          trialConversionRate={subscriptionStats.trialConversionRate}
          nrr={subscriptionStats.nrr}
          currency={orgCurrency}
        />

        {/* Filter Bar */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            {/* Left: status tabs + search */}
            <div className="flex items-center gap-3">
              <PillTabs
                layoutId="subscriptions-status-indicator"
                value={statusTab}
                onValueChange={(v) => setStatusTab(v as StatusTab)}
              >
                <PillTabsList>
                  {STATUS_TABS.map((tab) => (
                    <PillTabsTrigger key={tab} value={tab} count={counts[tab]}>
                      {tab}
                    </PillTabsTrigger>
                  ))}
                </PillTabsList>
              </PillTabs>

              <SearchInput
                value={search}
                onValueChange={setSearch}
                placeholder="Search by customer or email..."
              />
            </div>

            {/* Right: Products, Sort, Export */}
            <div className="flex items-center gap-2">
              <FilterDropdown
                label="Products"
                options={productOptions}
                selected={selectedProducts}
                onChange={setSelectedProducts}
                emptyLabel="No products"
              />

              <SortDropdown
                value={sortOrder}
                onChange={setSortOrder}
                options={SORT_OPTIONS}
              />

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="h-9 bg-muted/40 text-muted-foreground hover:bg-muted/60"
              >
                <Download01Icon size={14} className="text-muted-foreground/60" />
                Export CSV
              </Button>
            </div>
          </div>

          <ActiveFiltersBar filters={activeFilters} onClearAll={clearAllFilters} />
        </div>

        {/* Table */}
        <div className="w-full">
          {/* Header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-6 px-2 py-2.5 border-b border-border/40 text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">
            <div>Customer</div>
            <div>Status</div>
            <div>Started</div>
            <div>Renews</div>
            <div>Plan</div>
            <div className="w-12" />
          </div>

          {/* Rows */}
          {isLoadingSubscriptions || isLoadingProducts ? (
            <div className="divide-y divide-border/30">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-6 px-2 py-5 items-center animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-muted" />
                    <div className="flex flex-col gap-1.5">
                      <div className="h-3 w-28 rounded bg-muted" />
                      <div className="h-2.5 w-20 rounded bg-muted" />
                    </div>
                  </div>
                  <div className="h-5 w-16 rounded-full bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted" />
                  <div className="w-12" />
                </div>
              ))}
            </div>
          ) : filteredSubscriptions.length === 0 ? (
            <TableEmptyState
              title="No subscriptions found"
              description={
                hasActiveFilters
                  ? 'No subscriptions match your current filters.'
                  : 'New subscriptions will appear here once customers sign up.'
              }
              action={
                hasActiveFilters
                  ? { label: 'Clear filters', onClick: clearAllFilters }
                  : undefined
              }
            />
          ) : (
            <div className="divide-y divide-border/30">
              {filteredSubscriptions.map((sub) => {
                const product = productsList.find((p) => p.id === sub.product_id)
                const displayName = sub.customer?.name || sub.customer?.email || 'Unknown'
                const initial = displayName.charAt(0).toUpperCase()
                const willRenew = (sub.status === 'active' || sub.status === 'trialing') && !sub.cancel_at_period_end
                return (
                  <div
                    key={sub.id}
                    className="group grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-6 px-2 py-5 items-center hover:bg-muted/10 transition-colors"
                  >
                    {/* Customer */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-7 w-7 shrink-0 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                        {initial}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
                        {sub.customer?.name && (
                          <span className="text-xs text-muted-foreground truncate">{sub.customer.email}</span>
                        )}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-1.5">
                      <SubscriptionStatus status={sub.status} cancelAtPeriodEnd={sub.cancel_at_period_end} />
                      {sub.pending_downgrade && (
                        <PendingChangeBadge
                          variant="compact"
                          newPlanName={sub.pending_downgrade.newProductName}
                          scheduledFor={sub.pending_downgrade.scheduledFor}
                          newAmount={sub.pending_downgrade.newAmount}
                          newCurrency={sub.currency}
                        />
                      )}
                    </div>

                    {/* Started */}
                    <div className="text-sm text-muted-foreground">{formatDate(sub.created_at)}</div>

                    {/* Renews */}
                    <div className="text-sm text-muted-foreground">
                      {willRenew ? formatDate(sub.current_period_end) : <span className="text-muted-foreground/40">—</span>}
                    </div>

                    {/* Plan */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{product?.name || 'Unknown'}</span>
                      {product?.version && product.version > 1 && (
                        <Badge variant="outline" className="text-[10px] font-normal py-0">v{product.version}</Badge>
                      )}
                      {product?.version_status === 'superseded' && (
                        <Badge variant="secondary" className="text-[10px] font-normal py-0">Old</Badge>
                      )}
                      {product?.is_archived && (
                        <Badge variant="destructive" className="text-[10px] font-normal py-0">Archived</Badge>
                      )}
                    </div>

                    {/* View → on hover */}
                    <div className="w-12 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/dashboard/${organizationSlug}/customers/${sub.customer?.id || sub.customer_id}`}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                      >
                        View →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardBody>
  )
}
