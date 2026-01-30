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
import { useState } from 'react'

// ── Mock Data ──────────────────────────────────────────────
// TODO: Replace with real useSubscriptions and useProducts hooks

const MOCK_PRODUCTS = [
  { id: 'prod_1', name: 'Pro Plan' },
  { id: 'prod_2', name: 'Starter Plan' },
  { id: 'prod_3', name: 'Enterprise Plan' },
]

const MOCK_SUBSCRIPTIONS = [
  {
    id: 'sub_1',
    customer: { id: 'cust_1', name: 'Sarah Chen', email: 'sarah@example.com' },
    product: { id: 'prod_1', name: 'Pro Plan', is_archived: false },
    status: 'active',
    started_at: '2025-08-15T10:30:00Z',
    current_period_end: '2026-02-15T10:30:00Z',
    cancel_at_period_end: false,
  },
  {
    id: 'sub_2',
    customer: { id: 'cust_2', name: 'James Wilson', email: 'james@acme.co' },
    product: { id: 'prod_1', name: 'Pro Plan', is_archived: false },
    status: 'active',
    started_at: '2025-09-01T14:00:00Z',
    current_period_end: '2026-03-01T14:00:00Z',
    cancel_at_period_end: false,
  },
  {
    id: 'sub_3',
    customer: { id: 'cust_3', name: 'Maria Garcia', email: 'maria@startup.io' },
    product: { id: 'prod_2', name: 'Starter Plan', is_archived: false },
    status: 'trialing',
    started_at: '2026-01-10T09:15:00Z',
    current_period_end: '2026-02-10T09:15:00Z',
    cancel_at_period_end: false,
  },
  {
    id: 'sub_4',
    customer: { id: 'cust_4', name: 'Alex Johnson', email: 'alex@bigcorp.com' },
    product: { id: 'prod_3', name: 'Enterprise Plan', is_archived: false },
    status: 'past_due',
    started_at: '2025-06-20T16:45:00Z',
    current_period_end: '2026-01-20T16:45:00Z',
    cancel_at_period_end: false,
  },
  {
    id: 'sub_5',
    customer: { id: 'cust_5', name: 'Emily Brown', email: 'emily@design.co' },
    product: { id: 'prod_1', name: 'Pro Plan', is_archived: false },
    status: 'active',
    started_at: '2025-11-05T11:00:00Z',
    current_period_end: '2026-05-05T11:00:00Z',
    cancel_at_period_end: true,
  },
  {
    id: 'sub_6',
    customer: { id: 'cust_6', name: 'David Kim', email: 'david@tech.io' },
    product: { id: 'prod_2', name: 'Starter Plan', is_archived: false },
    status: 'active',
    started_at: '2025-10-12T08:30:00Z',
    current_period_end: '2026-04-12T08:30:00Z',
    cancel_at_period_end: false,
  },
  {
    id: 'sub_7',
    customer: { id: 'cust_7', name: 'Lisa Wang', email: 'lisa@creative.co' },
    product: { id: 'prod_3', name: 'Enterprise Plan', is_archived: false },
    status: 'canceled',
    started_at: '2025-04-01T12:00:00Z',
    current_period_end: '2025-10-01T12:00:00Z',
    cancel_at_period_end: false,
  },
  {
    id: 'sub_8',
    customer: { id: 'cust_8', name: 'Tom Brown', email: 'tom@agency.com' },
    product: { id: 'prod_1', name: 'Pro Plan', is_archived: false },
    status: 'active',
    started_at: '2025-12-01T15:20:00Z',
    current_period_end: '2026-06-01T15:20:00Z',
    cancel_at_period_end: false,
  },
  {
    id: 'sub_9',
    customer: { id: 'cust_9', name: 'Nina Patel', email: 'nina@saas.io' },
    product: { id: 'prod_2', name: 'Starter Plan', is_archived: false },
    status: 'canceled',
    started_at: '2025-07-15T10:00:00Z',
    current_period_end: '2026-01-15T10:00:00Z',
    cancel_at_period_end: false,
  },
  {
    id: 'sub_10',
    customer: { id: 'cust_10', name: 'Ryan Cooper', email: 'ryan@dev.co' },
    product: { id: 'prod_3', name: 'Enterprise Plan', is_archived: false },
    status: 'active',
    started_at: '2025-11-20T14:45:00Z',
    current_period_end: '2026-05-20T14:45:00Z',
    cancel_at_period_end: false,
  },
]

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
  organizationSlug,
  productIdFilter,
  statusFilter,
}: SubscriptionsPageProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>(
    statusFilter ?? 'active',
  )

  // If the product_id from the URL doesn't match any mock product, ignore it
  const validProductFilter =
    productIdFilter && MOCK_PRODUCTS.some((p) => p.id === productIdFilter)
      ? productIdFilter
      : 'all'

  const [selectedProduct, setSelectedProduct] = useState<string>(validProductFilter)
  const [cancellationFilter, setCancellationFilter] = useState<string>('all')

  const filteredSubscriptions = MOCK_SUBSCRIPTIONS.filter((sub) => {
    // Status filter
    if (selectedStatus === 'active' && !['active', 'trialing', 'past_due'].includes(sub.status)) {
      return false
    }
    if (selectedStatus === 'canceled' && sub.status !== 'canceled') {
      return false
    }

    // Product filter
    if (selectedProduct !== 'all' && sub.product.id !== selectedProduct) {
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
                {MOCK_PRODUCTS.map((p) => (
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
              cell: ({ row: { original: sub } }) => (
                <div className="flex flex-row items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {sub.customer.name.charAt(0)}
                  </div>
                  <div className="truncate text-sm">
                    {sub.customer.email}
                  </div>
                </div>
              ),
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
              accessorKey: 'started_at',
              header: ({ column }) => (
                <DataTableColumnHeader
                  column={column}
                  title="Subscription Date"
                />
              ),
              cell: ({ row: { original: sub } }) => (
                <span className="text-sm">{formatDate(sub.started_at)}</span>
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
              accessorKey: 'product',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Product" />
              ),
              cell: ({ row: { original: sub } }) => (
                <div className="flex items-center gap-2">
                  <span className="text-sm">{sub.product.name}</span>
                  {sub.product.is_archived && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-950 dark:text-red-400">
                      Archived
                    </span>
                  )}
                </div>
              ),
            },
            {
              id: 'actions',
              header: () => null,
              cell: ({ row: { original: sub } }) => (
                <span className="flex flex-row justify-end gap-x-2">
                  <Link
                    href={`/dashboard/${organizationSlug}/customers/${sub.customer.id}`}
                  >
                    <Button variant="secondary" size="sm">
                      View Customer
                    </Button>
                  </Link>
                </span>
              ),
            },
          ]}
          isLoading={false}
        />
      </div>
    </DashboardBody>
  )
}
