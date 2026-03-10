'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { SubscriptionStatus } from '@/components/Subscriptions/SubscriptionStatus'
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/atoms/datatable'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Download01Icon,
  Dollar01Icon,
  CreditCardIcon,
  PercentCircleIcon,
  RefreshIcon,
  ChartIncreaseIcon,
  ChartDecreaseIcon,
} from 'hugeicons-react'
import { Card, CardContent } from '@/components/ui/card'
import { useMRR } from '@/hooks/queries/analytics'
import Link from 'next/link'
import { useState, useMemo } from 'react'
import type { SortingState } from '@tanstack/react-table'
import { useProducts } from '@/hooks/queries/products'
import { useOrganizationSubscriptions } from '@/hooks/queries/subscriptions'
import { Badge } from '@/components/ui/badge'
import { downloadCSV } from '@/utils/csv'
import { formatCurrency } from '@/utils/metrics'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ── Stats Cards ────────────────────────────────────────────

function TrendLine({ trend }: { trend: number }) {
  const isPositive = trend >= 0
  return (
    <div className={`flex items-center gap-1 text-sm mt-2 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
      {isPositive ? <ChartIncreaseIcon size={14} /> : <ChartDecreaseIcon size={14} />}
      <span>{Math.abs(trend).toFixed(1)}% vs last month</span>
    </div>
  )
}

interface SubscriptionStatsCardsProps {
  mrr: number
  activeSubscriptions: number
  trialConversionRate: number
  nrr: number
}

function SubscriptionStatsCards({ mrr, activeSubscriptions, trialConversionRate, nrr }: SubscriptionStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">MRR</p>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Dollar01Icon size={15} className="text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{formatCurrency(mrr)}</div>
          {/* <TrendLine trend={0} /> */}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Subscriptions</p>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCardIcon size={15} className="text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{activeSubscriptions}</div>
          {/* <TrendLine trend={0} /> */}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trial Conversion</p>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <PercentCircleIcon size={15} className="text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{trialConversionRate.toFixed(1)}%</div>
          {/* <TrendLine trend={0} /> */}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Net Revenue Retention</p>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <RefreshIcon size={15} className="text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{nrr.toFixed(1)}%</div>
          {/* <TrendLine trend={0} /> */}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────

interface SubscriptionsPageProps {
  organizationId: string
  organizationSlug: string
  productIdFilter?: string
  statusFilter?: string
}

export default function SubscriptionsPage({
  organizationId,
  organizationSlug,
  productIdFilter,
  statusFilter,
}: SubscriptionsPageProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>(
    statusFilter ?? 'active',
  )
  const [selectedProduct, setSelectedProduct] = useState<string>(productIdFilter || 'all')
  const [cancellationFilter, setCancellationFilter] = useState<string>('all')
  const [sorting, setSorting] = useState<SortingState>([])

  // Fetch real products for the filter dropdown
  const { data: productsResponse, isLoading: isLoadingProducts } = useProducts(organizationId)

  // Fetch real subscriptions for the organization
  const { data: subscriptions, isLoading: isLoadingSubscriptions } = useOrganizationSubscriptions(organizationId)

  // Fetch MRR for stats cards
  const { data: mrrData } = useMRR(organizationId)

  // Compute stats from subscription data
  const subscriptionStats = useMemo(() => {
    if (!subscriptions) return { activeCount: 0, trialConversionRate: 0, nrr: 0 }
    const active = subscriptions.filter((s) => s.status === 'active').length
    const trialing = subscriptions.filter((s) => s.status === 'trialing').length
    const total = subscriptions.length
    const trialConversionRate = total > 0 ? ((active / Math.max(active + trialing, 1)) * 100) : 0
    return { activeCount: active, trialConversionRate, nrr: 0 }
  }, [subscriptions])

  // Filter and sort subscriptions based on selected filters and sorting state
  const filteredSubscriptions = useMemo(() => {
    if (!subscriptions) return []

    // 1. Filter
    const filtered = subscriptions.filter((sub) => {
      // Status filter
      if (selectedStatus === 'active' && !['active', 'trialing', 'past_due'].includes(sub.status)) {
        return false
      }
      if (selectedStatus === 'canceled' && sub.status !== 'canceled') {
        return false
      }

      // Product filter
      if (selectedProduct !== 'all' && sub.product_id !== selectedProduct) {
        return false
      }

      // Cancellation filter (only for active)
      if (selectedStatus === 'active' && cancellationFilter !== 'all') {
        if (cancellationFilter === 'renewing' && sub.cancel_at_period_end) {
          return false
        }
        if (cancellationFilter === 'ending' && !sub.cancel_at_period_end) {
          return false
        }
      }

      return true
    })

    // 2. Sort
    if (sorting.length > 0) {
      const { id, desc } = sorting[0]
      filtered.sort((a, b) => {
        let valA: string | number = ''
        let valB: string | number = ''

        if (id === 'customer') {
          valA = a.customer?.name || a.customer?.email || ''
          valB = b.customer?.name || b.customer?.email || ''
        } else if (id === 'status') {
          valA = a.status
          valB = b.status
        } else if (id === 'created_at') {
          valA = new Date(a.created_at).getTime()
          valB = new Date(b.created_at).getTime()
        } else if (id === 'current_period_end') {
          valA = a.current_period_end ? new Date(a.current_period_end).getTime() : 0
          valB = b.current_period_end ? new Date(b.current_period_end).getTime() : 0
        } else if (id === 'product') {
          const prodA = productsResponse?.items?.find((p) => p.id === a.product_id)
          const prodB = productsResponse?.items?.find((p) => p.id === b.product_id)
          valA = prodA?.name || ''
          valB = prodB?.name || ''
        }

        if (valA < valB) return desc ? 1 : -1
        if (valA > valB) return desc ? -1 : 1
        return 0
      })
    }

    return filtered
  }, [subscriptions, selectedStatus, selectedProduct, cancellationFilter, sorting, productsResponse])

  const handleExportCSV = () => {
    if (filteredSubscriptions.length === 0) return

    const exportData = filteredSubscriptions.map((sub) => {
      const product = productsResponse?.items?.find((p) => p.id === sub.product_id)
      return {
        'Customer Name': sub.customer?.name || '',
        'Customer Email': sub.customer?.email || '',
        Status: sub.status,
        Product: product?.name || 'Unknown Product',
        Version: product?.version ? `v${product.version}` : 'v1',
        Amount: formatCurrency(sub.amount, sub.currency),
        'Subscription Date': formatDate(sub.created_at),
        'Renewal Date': sub.current_period_end ? formatDate(sub.current_period_end) : '',
      }
    })

    const filename = `subscriptions-${organizationSlug}-${new Date().toISOString().split('T')[0]}.csv`
    downloadCSV(exportData, filename)
  }

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-8">
        {/* Stats Cards */}
        <SubscriptionStatsCards
          mrr={mrrData?.mrr ?? 0}
          activeSubscriptions={subscriptionStats.activeCount}
          trialConversionRate={subscriptionStats.trialConversionRate}
          nrr={subscriptionStats.nrr}
        />

        {/* Filters & Actions */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            {/* Status Filter */}
            <Select value={selectedStatus} onValueChange={(v) => {
              setSelectedStatus(v)
              if (v !== 'active') setCancellationFilter('all')
            }}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>

            {/* Cancellation Filter (only shown for active) */}
            {selectedStatus === 'active' && (
              <Select value={cancellationFilter} onValueChange={setCancellationFilter}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Active</SelectItem>
                  <SelectItem value="renewing">Renewing</SelectItem>
                  <SelectItem value="ending">Ending at Period End</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Product Filter */}
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {productsResponse?.items?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.version && p.version > 1 && ` (v${p.version})`}
                    {p.version_status === 'superseded' && ' (Old Version)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="gap-x-2"
            onClick={handleExportCSV}
          >
            <Download01Icon size={16} />
            Export CSV
          </Button>
        </div>

        {/* Subscriptions Table */}
        <DataTable
          data={filteredSubscriptions}
          columns={[
            {
              id: 'customer',
              accessorKey: 'customer',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Customer" />
              ),
              cell: ({ row: { original: sub } }) => {
                if (!sub.customer) {
                  return <span className="text-sm text-muted-foreground">Unknown</span>
                }
                const displayName = sub.customer.name || sub.customer.email
                const initial = displayName?.charAt(0).toUpperCase() || '?'
                return (
                  <div className="flex flex-row items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {initial}
                    </div>
                    <div className="flex flex-col truncate">
                      <div className="truncate text-sm font-medium">
                        {displayName}
                      </div>
                      {sub.customer.name && (
                        <div className="truncate text-xs text-muted-foreground">
                          {sub.customer.email}
                        </div>
                      )}
                    </div>
                  </div>
                )
              },
            },
            {
              accessorKey: 'status',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Status" />
              ),
              cell: ({ row: { original: sub } }) => (
                <SubscriptionStatus status={sub.status} />
              ),
            },
            {
              accessorKey: 'created_at',
              header: ({ column }) => (
                <DataTableColumnHeader
                  column={column}
                  title="Subscription Date"
                />
              ),
              cell: ({ row: { original: sub } }) => (
                <span className="text-sm">{formatDate(sub.created_at)}</span>
              ),
            },
            {
              accessorKey: 'current_period_end',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Renewal Date" />
              ),
              cell: ({ row: { original: sub } }) => {
                const willRenew =
                  (sub.status === 'active' || sub.status === 'trialing') &&
                  !sub.cancel_at_period_end
                return willRenew ? (
                  <span className="text-sm">
                    {formatDate(sub.current_period_end)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">&mdash;</span>
                )
              },
            },
            {
              id: 'product',
              accessorKey: 'product_id',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Product" />
              ),
              cell: ({ row: { original: sub } }) => {
                const product = productsResponse?.items?.find((p) => p.id === sub.product_id)
                return (
                  <div className="flex flex-row items-center gap-2 whitespace-nowrap">
                    <span className="text-sm font-medium">{product?.name || 'Unknown Product'}</span>
                    {product?.version && product?.version > 1 && (
                      <Badge variant="outline" className="text-[10px] font-normal py-0">
                        v{product.version}
                      </Badge>
                    )}
                    {product?.version_status === 'superseded' && (
                      <Badge variant="secondary" className="text-[10px] font-normal py-0">
                        Old Version
                      </Badge>
                    )}
                    {product?.is_archived && (
                      <Badge variant="destructive" className="text-[10px] font-normal py-0">
                        Archived
                      </Badge>
                    )}
                  </div>
                )
              },
            },
            {
              id: 'actions',
              header: () => null,
              cell: ({ row: { original: sub } }) => (
                <span className="flex flex-row justify-end gap-x-2 ">
                  <Link
                    href={`/dashboard/${organizationSlug}/customers/${sub.customer?.id || sub.customer_id}`}
                  >
                    <Button variant="secondary" size="sm">
                      View Customer
                    </Button>
                  </Link>
                </span>
              ),
            },
          ]}
          isLoading={isLoadingSubscriptions || isLoadingProducts}
          sorting={sorting}
          onSortingChange={setSorting}
          rowCount={filteredSubscriptions.length}
        />
      </div>
    </DashboardBody>
  )
}
