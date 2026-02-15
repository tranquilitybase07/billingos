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
import { Download as DownloadOutlined } from '@mui/icons-material'
import Link from 'next/link'
import { useState, useMemo } from 'react'
import { useProducts } from '@/hooks/queries/products'
import { useOrganizationSubscriptions } from '@/hooks/queries/subscriptions'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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

  // Fetch real products for the filter dropdown
  const { data: productsResponse, isLoading: isLoadingProducts } = useProducts(organizationId)

  // Fetch real subscriptions for the organization
  const { data: subscriptions, isLoading: isLoadingSubscriptions } = useOrganizationSubscriptions(organizationId)

  // Filter subscriptions based on selected filters
  const filteredSubscriptions = useMemo(() => {
    if (!subscriptions) return []

    return subscriptions.filter((sub) => {
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
  }, [subscriptions, selectedStatus, selectedProduct, cancellationFilter])

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-8">
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
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="secondary" size="sm" className="gap-x-2">
            <DownloadOutlined className="h-4 w-4" />
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
                    <div className="truncate text-sm">
                      {sub.customer.email}
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
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{product?.name || 'Unknown Product'}</span>
                    {product?.is_archived && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-950 dark:text-red-400">
                        Archived
                      </span>
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
        />
      </div>
    </DashboardBody>
  )
}
