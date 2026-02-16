'use client'

import { MiniMetricChartBox } from '@/components/Metrics/MiniMetricChartBox'
import { OrderStatus } from '@/components/Orders/OrderStatus'
import { SubscriptionStatus } from '@/components/Subscriptions/SubscriptionStatus'
import { RevenueWidget } from '@/components/Widgets/RevenueWidget'
import {
  Product,
  useProductSubscriptionCount,
  useProductRevenueMetrics
} from '@/hooks/queries/products'
import { useProductSubscriptions } from '@/hooks/queries/subscriptions'
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/atoms/datatable'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/utils/metrics'
import Link from 'next/link'

// ── Mock Data ──────────────────────────────────────────────
// TODO: Implement real API hooks when orders and discounts features are ready

const MOCK_ORDERS = [
  {
    id: 'ord_1',
    customer: { id: 'cust_1', name: 'Sarah Chen', email: 'sarah@example.com' },
    net_amount: 4900,
    currency: 'usd',
    status: 'paid',
    created_at: '2026-01-25T08:30:00Z',
  },
  {
    id: 'ord_2',
    customer: { id: 'cust_2', name: 'James Wilson', email: 'james@acme.co' },
    net_amount: 9900,
    currency: 'usd',
    status: 'paid',
    created_at: '2026-01-22T14:15:00Z',
  },
  {
    id: 'ord_3',
    customer: { id: 'cust_6', name: 'David Kim', email: 'david@tech.io' },
    net_amount: 4900,
    currency: 'usd',
    status: 'pending',
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'ord_4',
    customer: { id: 'cust_3', name: 'Maria Garcia', email: 'maria@startup.io' },
    net_amount: 9900,
    currency: 'usd',
    status: 'paid',
    created_at: '2026-01-18T09:45:00Z',
  },
  {
    id: 'ord_5',
    customer: { id: 'cust_7', name: 'Lisa Wang', email: 'lisa@creative.co' },
    net_amount: 4900,
    currency: 'usd',
    status: 'refunded',
    created_at: '2026-01-15T16:30:00Z',
  },
]

const MOCK_DISCOUNTS = [
  {
    id: 'disc_1',
    name: 'Early Bird',
    code: 'EARLY20',
    type: 'percentage' as const,
    amount: 20,
    created_at: '2025-12-01T00:00:00Z',
  },
  {
    id: 'disc_2',
    name: 'Annual Promo',
    code: 'ANNUAL10',
    type: 'percentage' as const,
    amount: 10,
    created_at: '2026-01-01T00:00:00Z',
  },
]

// ── Component ──────────────────────────────────────────────

export interface ProductOverviewProps {
  organizationSlug: string
  product: Product
  isRecurring: boolean
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export const ProductOverview = ({
  organizationSlug,
  product,
  isRecurring,
}: ProductOverviewProps) => {
  // Fetch real subscription count
  const { data: subscriptionCount, isLoading: isLoadingSubscriptionCount } =
    useProductSubscriptionCount(product.id)

  // Fetch real subscriptions for the product
  const { data: subscriptionsData, isLoading: isLoadingSubscriptions } =
    useProductSubscriptions(product.id, { limit: 10 })

  // Fetch real revenue metrics
  const { data: revenueMetrics, isLoading: isLoadingRevenue } =
    useProductRevenueMetrics(product.id)

  return (
    <div className="flex flex-col gap-y-16">
      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isRecurring ? (
          <>
            <MiniMetricChartBox
              title="Active Subscriptions"
              value={subscriptionCount?.active ?? 0}
              type="scalar"
              isLoading={isLoadingSubscriptionCount}
            />
            <MiniMetricChartBox
              title="Monthly Recurring Revenue"
              value={revenueMetrics?.mrr ?? 0}
              type="currency"
              isLoading={isLoadingRevenue}
            />
          </>
        ) : (
          <>
            <MiniMetricChartBox
              title="One-Time Products"
              value={284}
              type="scalar"
            />
            <MiniMetricChartBox
              title="Today's Revenue"
              value={34900}
              type="currency"
            />
          </>
        )}
        <MiniMetricChartBox
          title="Revenue Last 30 Days"
          value={revenueMetrics?.revenueLastThirtyDays ?? 0}
          type="currency"
          isLoading={isLoadingRevenue}
        />
      </div>

      {/* Subscriptions Table (recurring products only) */}
      {isRecurring && (
        <div className="flex flex-col gap-y-6">
          <div className="flex flex-row items-center justify-between gap-x-6">
            <div className="flex flex-col gap-y-1">
              <h2 className="text-lg font-medium">Subscriptions</h2>
              <p className="text-sm text-muted-foreground">
                Showing 10 most recent subscriptions for {product.name}
              </p>
            </div>
            <Link
              href={`/dashboard/${organizationSlug}/sales/subscriptions?product_id=${product.id}`}
            >
              <Button size="sm" variant="secondary">
                View All
              </Button>
            </Link>
          </div>
          <DataTable
            data={subscriptionsData?.subscriptions || []}
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
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {initial}
                      </div>
                      <div className="truncate text-sm">{sub.customer.email}</div>
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
                id: 'actions',
                header: () => null,
                cell: ({ row: { original: sub } }) => (
                  <span className="flex flex-row justify-end gap-x-2">
                    <Link
                      href={`/dashboard/${organizationSlug}/customers/${sub.customer?.id || sub.customer_id}`}
                    >
                      <Button variant="secondary" size="sm" className="hover:cursor-pointer">
                        View Customer
                      </Button>
                    </Link>
                  </span>
                ),
              },
            ]}
            isLoading={isLoadingSubscriptions}
          />
        </div>
      )}

      {/* Orders Table */}
      <div className="flex flex-col gap-y-6">
        <div className="flex flex-row items-center justify-between gap-x-6">
          <div className="flex flex-col gap-y-1">
            <h2 className="text-lg font-medium">Orders</h2>
            <p className="text-sm text-muted-foreground">
              Showing last 10 orders for {product.name}
            </p>
          </div>
          <Link
            href={`/dashboard/${organizationSlug}/sales?product_id=${product.id}`}
          >
            <Button size="sm" variant="secondary">
              View All
            </Button>
          </Link>
        </div>
        <DataTable
          data={MOCK_ORDERS}
          columns={[
            {
              id: 'customer',
              accessorKey: 'customer',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Customer" />
              ),
              cell: ({ row: { original: order } }) => (
                <div className="flex flex-row items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {order.customer.name.charAt(0)}
                  </div>
                  <div className="truncate text-sm">
                    {order.customer.email}
                  </div>
                </div>
              ),
            },
            {
              accessorKey: 'net_amount',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Amount" />
              ),
              cell: ({ row: { original: order } }) => (
                <span className="text-sm">
                  {formatCurrency(order.net_amount, order.currency)}
                </span>
              ),
            },
            {
              accessorKey: 'status',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Status" />
              ),
              cell: ({ row: { original: order } }) => (
                <OrderStatus status={order.status} />
              ),
            },
            {
              accessorKey: 'created_at',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Date" />
              ),
              cell: ({ row: { original: order } }) => (
                <span className="text-sm">{formatDate(order.created_at)}</span>
              ),
            },
            {
              id: 'actions',
              header: () => null,
              cell: ({ row: { original: order } }) => (
                <span className="flex flex-row justify-end">
                  <Link
                    href={`/dashboard/${organizationSlug}/sales/${order.id}`}
                  >
                    <Button variant="secondary" size="sm">
                      View
                    </Button>
                  </Link>
                </span>
              ),
            },
          ]}
          isLoading={false}
        />
      </div>

      {/* Revenue Widget */}
      <RevenueWidget />

      {/* Applicable Discounts */}
      {!product.is_archived && (
        <div className="flex flex-col gap-y-6">
          <div className="flex flex-row items-center justify-between gap-x-6">
            <div className="flex flex-col gap-y-1">
              <h2 className="text-lg font-medium">Applicable Discounts</h2>
              <p className="text-sm text-muted-foreground">
                All discounts valid for {product.name}
              </p>
            </div>
          </div>
          <DataTable
            data={MOCK_DISCOUNTS}
            columns={[
              {
                accessorKey: 'name',
                header: ({ column }) => (
                  <DataTableColumnHeader column={column} title="Name" />
                ),
                cell: ({ row: { original: discount } }) => (
                  <span className="text-sm font-medium">{discount.name}</span>
                ),
              },
              {
                accessorKey: 'code',
                header: ({ column }) => (
                  <DataTableColumnHeader column={column} title="Code" />
                ),
                cell: ({ row: { original: discount } }) => (
                  <code className="rounded bg-muted px-2 py-0.5 text-xs">
                    {discount.code}
                  </code>
                ),
              },
              {
                accessorKey: 'amount',
                header: ({ column }) => (
                  <DataTableColumnHeader column={column} title="Amount" />
                ),
                cell: ({ row: { original: discount } }) => (
                  <span className="text-sm">{discount.amount}%</span>
                ),
              },
              {
                accessorKey: 'created_at',
                header: ({ column }) => (
                  <DataTableColumnHeader column={column} title="Date" />
                ),
                cell: ({ row: { original: discount } }) => (
                  <span className="text-sm">
                    {formatDate(discount.created_at)}
                  </span>
                ),
              },
            ]}
            isLoading={false}
          />
        </div>
      )}
    </div>
  )
}
