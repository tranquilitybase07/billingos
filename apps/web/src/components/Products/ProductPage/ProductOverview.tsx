'use client'

import { MiniMetricChartBox } from '@/components/Metrics/MiniMetricChartBox'
import {
  Product,
  useProductSubscriptionCount,
  useProductRevenueMetrics,
} from '@/hooks/queries/products'
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/atoms/datatable'
import Link from 'next/link'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useProductDiscounts } from '@/hooks/queries/discounts'
import { getDiscountDisplay } from '@/utils/discount'
import { useProductSubscriptions } from '@/hooks/queries/subscriptions'
import { Button } from '@/components/ui/button'
import { ProductPreviewCard } from './ProductPreviewCard'

export interface ProductOverviewProps {
  organizationSlug: string
  product: Product
  isRecurring: boolean | undefined
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
  const { organization } = useOrganization()
  const orgCurrency = organization.default_currency || 'usd'
  const { data: subscriptionCount, isLoading: isLoadingSubscriptionCount } =
    useProductSubscriptionCount(product.id)

  const { data: revenueMetrics, isLoading: isLoadingRevenue } =
    useProductRevenueMetrics(product.id)

  const { data: discounts, isLoading: isLoadingDiscounts } = useProductDiscounts(
    product.id,
    product.organization_id
  )

  const { data: subscriptionsData, isLoading: isLoadingSubscriptions } =
    useProductSubscriptions(product.id, { limit: 5 })

  // Deduplicate customers from subscriptions (latest 5 unique)
  const recentCustomers = (() => {
    const seen = new Set<string>()
    const customers: Array<{ id: string; name: string | null; email: string; subscribedAt: string }> = []
    for (const sub of subscriptionsData?.subscriptions ?? []) {
      if (!sub.customer) continue
      if (seen.has(sub.customer.id)) continue
      seen.add(sub.customer.id)
      customers.push({
        id: sub.customer.id,
        name: sub.customer.name,
        email: sub.customer.email,
        subscribedAt: sub.created_at,
      })
      if (customers.length === 5) break
    }
    return customers
  })()

  return (
    <div className="flex flex-col gap-y-8 lg:flex-row lg:items-start lg:gap-x-10">
      {/* Left column */}
      <div className="flex flex-col gap-y-10 lg:flex-1 min-w-0">
        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                currency={orgCurrency}
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
                currency={orgCurrency}
              />
            </>
          )}
          <MiniMetricChartBox
            title="Revenue Last 30 Days"
            value={revenueMetrics?.revenueLastThirtyDays ?? 0}
            type="currency"
            currency={orgCurrency}
            isLoading={isLoadingRevenue}
          />
        </div>

        {/* Recent Customers */}
        <div className="flex flex-col gap-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-medium">Recent Customers</h2>
              <p className="text-sm text-muted-foreground">
                Latest customers subscribed to {product.name}
              </p>
            </div>
            <Button size="sm" variant="secondary" asChild>
              <Link href={`/dashboard/${organizationSlug}/customers`}>
                View All
              </Link>
            </Button>
          </div>
          <DataTable
            data={recentCustomers}
            columns={[
              {
                id: 'customer',
                accessorKey: 'email',
                header: ({ column }) => (
                  <DataTableColumnHeader column={column} title="Customer" />
                ),
                cell: ({ row: { original: c } }) => {
                  const displayName = c.name || c.email
                  const initial = displayName.charAt(0).toUpperCase()
                  return (
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        {c.name && (
                          <div className="text-sm font-medium truncate">{c.name}</div>
                        )}
                        <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                      </div>
                    </div>
                  )
                },
              },
              {
                accessorKey: 'subscribedAt',
                header: ({ column }) => (
                  <DataTableColumnHeader column={column} title="Subscribed" />
                ),
                cell: ({ row: { original: c } }) => (
                  <span className="text-sm text-muted-foreground">
                    {formatDate(c.subscribedAt)}
                  </span>
                ),
              },
              {
                id: 'actions',
                header: () => null,
                cell: ({ row: { original: c } }) => (
                  <div className="flex justify-end">
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/dashboard/${organizationSlug}/customers/${c.id}`}>
                        View
                      </Link>
                    </Button>
                  </div>
                ),
              },
            ]}
            isLoading={isLoadingSubscriptions}
          />
        </div>

        {/* Applicable Discounts */}
        {!product.is_archived && (
          <div className="flex flex-col gap-y-4">
            <div>
              <h2 className="text-base font-medium">Applicable Discounts</h2>
              <p className="text-sm text-muted-foreground">
                All discounts valid for {product.name}
              </p>
            </div>
            <DataTable
              data={discounts || []}
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
                  cell: ({ row: { original: discount } }) =>
                    discount.code ? (
                      <code className="rounded bg-muted px-2 py-0.5 text-xs">
                        {discount.code}
                      </code>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    ),
                },
                {
                  id: 'amount',
                  header: ({ column }) => (
                    <DataTableColumnHeader column={column} title="Amount" />
                  ),
                  cell: ({ row: { original: discount } }) => (
                    <span className="text-sm">{getDiscountDisplay(discount)}</span>
                  ),
                },
                {
                  accessorKey: 'created_at',
                  header: ({ column }) => (
                    <DataTableColumnHeader column={column} title="Date" />
                  ),
                  cell: ({ row: { original: discount } }) => (
                    <span className="text-sm">{formatDate(discount.created_at)}</span>
                  ),
                },
              ]}
              isLoading={isLoadingDiscounts}
            />
          </div>
        )}

      </div>

      {/* Right sidebar */}
      <div className="w-full lg:w-[380px] lg:shrink-0">
        <ProductPreviewCard product={product} />
      </div>
    </div>
  )
}
