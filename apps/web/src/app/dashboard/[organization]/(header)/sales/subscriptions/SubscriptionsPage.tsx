'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { SubscriptionStatus } from '@/components/Subscriptions/SubscriptionStatus'
import { PendingChangeBadge } from '@/components/Subscriptions/PendingChangeBadge'
import { Badge } from '@/components/ui/badge'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useMRR } from '@/hooks/queries/analytics'
import Link from 'next/link'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useProducts } from '@/hooks/queries/products'
import { useOrganizationSubscriptions } from '@/hooks/queries/subscriptions'
import { downloadCSV } from '@/utils/csv'
import { formatCurrency } from '@/utils/metrics'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search01Icon,
  Cancel01Icon,
  ArrowUpDownIcon,
  Download01Icon,
  Tick01Icon,
  ArrowDown01Icon,
} from 'hugeicons-react'
import { MiniMetricChartBox } from '@/components/Metrics/MiniMetricChartBox'

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

// ── Filter chip ────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      layout
      className="flex items-center gap-1.5 px-2.5 py-1 bg-muted border border-border rounded-md text-xs font-medium text-muted-foreground"
    >
      <span className="truncate max-w-[150px]">{label}</span>
      <button
        onClick={onRemove}
        className="text-muted-foreground/60 hover:text-foreground transition-colors rounded-sm p-0.5"
      >
        <Cancel01Icon size={10} />
      </button>
    </motion.div>
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

export default function SubscriptionsPage({
  organizationId,
  organizationSlug,
  productIdFilter,
}: SubscriptionsPageProps) {
  const { organization } = useOrganization()
  const orgCurrency = organization.default_currency || 'usd'

  const [statusTab, setStatusTab] = useState<StatusTab>('All')
  const [search, setSearch] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<string[]>(
    productIdFilter ? [productIdFilter] : [],
  )
  const [sortOrder, setSortOrder] = useState<SortOption>('Newest')
  const [isProductOpen, setIsProductOpen] = useState(false)
  const [isSortOpen, setIsSortOpen] = useState(false)

  const productRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (productRef.current && !productRef.current.contains(e.target as Node)) setIsProductOpen(false)
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setIsSortOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const toggleProduct = (id: string) => {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
  }

  const hasActiveFilters = statusTab !== 'All' || search !== '' || selectedProducts.length > 0

  const clearAllFilters = () => {
    setStatusTab('All')
    setSearch('')
    setSelectedProducts([])
  }

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
  }, [subscriptions, statusTab, selectedProducts, search, sortOrder, productsList])

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
  const SORT_OPTIONS: SortOption[] = ['Newest', 'Oldest', 'Renewal soonest', 'A-Z']

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
              {/* Animated status tabs */}
              <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border">
                {STATUS_TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStatusTab(tab)}
                    className={cn(
                      'relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                      statusTab === tab ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                    )}
                  >
                    {statusTab === tab && (
                      <motion.div
                        layoutId="status-indicator"
                        className="absolute inset-0 bg-background rounded-md shadow-sm"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      {tab}
                      <span className={cn('text-[11px]', statusTab === tab ? 'text-muted-foreground' : 'text-muted-foreground/60')}>
                        {counts[tab]}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative group">
                <Search01Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-foreground transition-colors" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by customer or email..."
                  className="w-64 bg-muted/40 border border-border rounded-lg py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <Cancel01Icon size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Right: Products, Sort, Export */}
            <div className="flex items-center gap-2">
              {/* Products multi-select */}
              <div className="relative" ref={productRef}>
                <button
                  onClick={() => setIsProductOpen((v) => !v)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
                    selectedProducts.length > 0
                      ? 'bg-muted border-border text-foreground'
                      : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  Products
                  {selectedProducts.length > 0 && (
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-muted-foreground/20 text-[10px] font-medium">
                      {selectedProducts.length}
                    </span>
                  )}
                  <ArrowDown01Icon size={14} className="text-muted-foreground" />
                </button>
                <AnimatePresence>
                  {isProductOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-1.5 w-56 bg-popover border border-border rounded-lg shadow-xl overflow-hidden z-20"
                    >
                      <div className="p-1.5 space-y-0.5">
                        {productsList.map((product) => {
                          const isSelected = selectedProducts.includes(product.id)
                          return (
                            <button
                              key={product.id}
                              onClick={() => toggleProduct(product.id)}
                              className="w-full flex items-center justify-between px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground rounded-md transition-colors"
                            >
                              {product.name}
                              {isSelected && <Tick01Icon size={14} className="text-foreground" />}
                            </button>
                          )
                        })}
                        {productsList.length === 0 && (
                          <p className="px-2.5 py-2 text-sm text-muted-foreground">No products</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Sort dropdown */}
              <div className="relative" ref={sortRef}>
                <button
                  onClick={() => setIsSortOpen((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground bg-muted/40 border border-border rounded-lg hover:bg-muted/60 transition-colors"
                >
                  <ArrowUpDownIcon size={13} className="text-muted-foreground/60" />
                  Sort: {sortOrder}
                </button>
                <AnimatePresence>
                  {isSortOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-1.5 w-48 bg-popover border border-border rounded-lg shadow-xl overflow-hidden z-20"
                    >
                      <div className="p-1.5 space-y-0.5">
                        {SORT_OPTIONS.map((option) => (
                          <button
                            key={option}
                            onClick={() => { setSortOrder(option); setIsSortOpen(false) }}
                            className="w-full flex items-center justify-between px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground rounded-md transition-colors"
                          >
                            {option}
                            {sortOrder === option && <Tick01Icon size={14} className="text-foreground" />}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Export */}
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground bg-muted/40 border border-border rounded-lg hover:bg-muted/60 transition-colors"
              >
                <Download01Icon size={14} className="text-muted-foreground/60" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Active filter chips */}
          <AnimatePresence>
            {hasActiveFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex items-center gap-2 overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-2 py-1">
                  {statusTab !== 'All' && (
                    <FilterChip label={`Status: ${statusTab}`} onRemove={() => setStatusTab('All')} />
                  )}
                  {search && (
                    <FilterChip label={`Search: ${search}`} onRemove={() => setSearch('')} />
                  )}
                  {selectedProducts.map((id) => {
                    const p = productsList.find((p) => p.id === id)
                    return (
                      <FilterChip key={id} label={`Product: ${p?.name ?? id}`} onRemove={() => toggleProduct(id)} />
                    )
                  })}
                  <button
                    onClick={clearAllFilters}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 transition-colors"
                  >
                    Clear all
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <p className="text-sm font-medium text-foreground mb-1">No subscriptions found</p>
              <p className="text-sm text-muted-foreground mb-4">No subscriptions match your current filters.</p>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="px-4 py-2 bg-muted text-foreground text-sm font-medium rounded-md hover:bg-muted/80 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
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
