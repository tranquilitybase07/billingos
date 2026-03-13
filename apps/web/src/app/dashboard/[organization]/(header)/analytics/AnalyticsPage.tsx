'use client'

import { useMemo, useState } from 'react'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { CardFlat, CardContent, CardGhost, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable, DataTableColumnDef, DataTableColumnHeader } from '@/components/atoms/datatable'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useUsageOverview,
  useUsageByFeature,
  useAtRiskCustomers,
  useUsageTrends,
  useMRR,
} from '@/hooks/queries/analytics'
import { useListCustomers } from '@/hooks/queries/customers'

interface AnalyticsPageProps {
  organizationId: string
  organizationSlug: string
}

interface FeatureUsageRow {
  feature_key: string
  feature_title: string
  total_consumed: number
  avg_per_customer: number
  customer_count: number
  at_limit_count: number
}

interface AtRiskCustomerRow {
  customer_id: string
  name: string
  email: string | null
  external_id: string | null
  feature_key: string
  consumed: number
  limit: number
  percentage_used: number
  resets_at: string
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export default function AnalyticsPage({
  organizationId,
}: AnalyticsPageProps) {
  const [selectedFeature, setSelectedFeature] = useState<string>('')

  const { data: overview, isLoading: overviewLoading } = useUsageOverview(organizationId)
  const { data: byFeature, isLoading: byFeatureLoading } = useUsageByFeature(organizationId)
  const { data: atRisk, isLoading: atRiskLoading } = useAtRiskCustomers(organizationId, 80)
  const { data: mrr } = useMRR(organizationId)
  const { data: customersData } = useListCustomers(organizationId, { limit: 1000, page: 1 })
  const { data: trends } = useUsageTrends(
    organizationId,
    selectedFeature,
    30,
  )

  // Set first feature as selected when data loads
  if (!selectedFeature && byFeature?.data?.length) {
    setSelectedFeature(byFeature.data[0].feature_key)
  }

  const featureUsageRows = (byFeature?.data ?? []) as FeatureUsageRow[]
  const atRiskRows = (atRisk?.data ?? []) as AtRiskCustomerRow[]
  const customerById = useMemo(
    () => new Map((customersData?.data ?? []).map((customer) => [
      customer.id,
      {
        name: customer.name || '',
        email: customer.email || '',
        external_id: customer.external_id || '',
      },
    ])),
    [customersData?.data],
  )

  const featureUsageColumns = useMemo<DataTableColumnDef<FeatureUsageRow>[]>(
    () => [
      {
        accessorKey: 'feature_title',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Feature" />
        ),
        cell: ({ row: { original: feature } }) => (
          <div>
            <div className="font-medium">{feature.feature_title}</div>
            <div className="text-xs text-muted-foreground">{feature.feature_key}</div>
          </div>
        ),
      },
      {
        accessorKey: 'total_consumed',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Total Consumed" className="justify-end text-right" />
        ),
        cell: ({ row: { original: feature } }) => (
          <div className="text-right">{formatNumber(feature.total_consumed)}</div>
        ),
      },
      {
        accessorKey: 'avg_per_customer',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Avg/Customer" className="justify-end text-right" />
        ),
        cell: ({ row: { original: feature } }) => (
          <div className="text-right">{formatNumber(feature.avg_per_customer)}</div>
        ),
      },
      {
        accessorKey: 'customer_count',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Customers" className="justify-end text-right" />
        ),
        cell: ({ row: { original: feature } }) => (
          <div className="text-right">{feature.customer_count}</div>
        ),
      },
      {
        accessorKey: 'at_limit_count',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="At Limit" className="justify-end text-right" />
        ),
        cell: ({ row: { original: feature } }) => (
          <div className="text-right">
            {feature.at_limit_count > 0 ? (
              <Badge variant="destructive">{feature.at_limit_count}</Badge>
            ) : (
              <span className="text-muted-foreground">0</span>
            )}
          </div>
        ),
      },
    ],
    [],
  )

  const atRiskColumns = useMemo<DataTableColumnDef<AtRiskCustomerRow>[]>(
    () => [
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Customer" />
        ),
        cell: ({ row: { original: customer } }) => {
          const customerDetails = customerById.get(customer.customer_id)
          const displayName =
            customerDetails?.name ||
            customer.name ||
            customerDetails?.email ||
            customer.email ||
            customerDetails?.external_id ||
            customer.external_id ||
            customer.customer_id
          const subtitle =
            customerDetails?.email ||
            customer.email ||
            customerDetails?.external_id ||
            customer.external_id ||
            customer.customer_id

          return (
            <div>
              <div className="font-medium">{displayName}</div>
              <div className="text-xs text-muted-foreground">{subtitle}</div>
            </div>
          )
        },
      },
      {
        accessorKey: 'feature_key',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Feature" />
        ),
      },
      {
        id: 'usage',
        accessorFn: (customer) => customer.consumed,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Usage" className="justify-end text-right" />
        ),
        cell: ({ row: { original: customer } }) => (
          <div className="text-right">
            {formatNumber(customer.consumed)} / {formatNumber(customer.limit)}
          </div>
        ),
      },
      {
        accessorKey: 'percentage_used',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="% Used" className="justify-end text-right" />
        ),
        cell: ({ row: { original: customer } }) => (
          <div className="text-right">
            <Badge variant={customer.percentage_used >= 100 ? 'destructive' : 'secondary'}>
              {customer.percentage_used}%
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: 'resets_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Resets" className="justify-end text-right" />
        ),
        cell: ({ row: { original: customer } }) => (
          <div className="text-right text-sm text-muted-foreground">
            {new Date(customer.resets_at).toLocaleDateString()}
          </div>
        ),
      },
    ],
    [customerById],
  )

  return (
    <DashboardBody>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-muted-foreground">
            Monitor usage trends, feature consumption, and at-risk customers
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardFlat>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {overviewLoading ? '...' : formatNumber(overview?.total_consumption ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                units consumed this period
              </p>
            </CardContent>
          </CardFlat>

          <CardFlat>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Metered Customers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {overviewLoading ? '...' : overview?.active_metered_customers ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                customers with usage
              </p>
            </CardContent>
          </CardFlat>

          <CardFlat>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                At Limit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {overviewLoading ? '...' : overview?.at_limit_count ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                customers at quota
              </p>
            </CardContent>
          </CardFlat>

          <CardFlat>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                MRR
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${((mrr?.mrr ?? 0) / 100).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                monthly recurring revenue
              </p>
            </CardContent>
          </CardFlat>
        </div>

        {/* Usage Trends */}
        <CardGhost>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Usage Trends (Last 30 Days)</CardTitle>
            {byFeature?.data && byFeature.data.length > 0 && (
              <Select value={selectedFeature} onValueChange={setSelectedFeature}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select feature" />
                </SelectTrigger>
                <SelectContent>
                  {byFeature.data.map((f) => (
                    <SelectItem key={f.feature_key} value={f.feature_key}>
                      {f.feature_title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardHeader>
          <CardContent>
            {!selectedFeature ? (
              <p className="text-muted-foreground text-sm">No metered features found.</p>
            ) : !trends?.data?.length ? (
              <p className="text-muted-foreground text-sm">No usage data yet for this feature.</p>
            ) : (
              <div className="space-y-2">
                {/* Simple bar chart using divs */}
                <div className="flex items-end gap-1 h-40">
                  {trends.data.map((point) => {
                    const maxConsumed = Math.max(...trends.data.map(d => d.consumed), 1)
                    const heightPct = (point.consumed / maxConsumed) * 100
                    return (
                      <div
                        key={point.date}
                        className="flex-1 bg-primary rounded-t hover:bg-primary/80 transition-colors relative group"
                        style={{ height: `${Math.max(heightPct, 2)}%` }}
                        title={`${point.date}: ${point.consumed} units, ${point.customer_count} customers`}
                      >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-popover text-popover-foreground text-xs rounded p-1 whitespace-nowrap shadow-lg z-10">
                          {point.date}: {formatNumber(point.consumed)} units
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{trends.data[0]?.date}</span>
                  <span>{trends.data[trends.data.length - 1]?.date}</span>
                </div>
              </div>
            )}
          </CardContent>
        </CardGhost>

        {/* Per-Feature Breakdown */}
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold">Usage by Feature</h2>
          <DataTable
            data={featureUsageRows}
            columns={featureUsageColumns}
            isLoading={byFeatureLoading}
            emptyState={(
              <div className="py-8 text-center text-sm text-muted-foreground">
                No metered features found.
              </div>
            )}
          />
        </div>

        {/* At-Risk Customers */}
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold">
            At-Risk Customers
            {atRisk?.total_at_risk ? (
              <Badge variant="destructive" className="ml-2">{atRisk.total_at_risk}</Badge>
            ) : null}
          </h2>
          <DataTable
            data={atRiskRows}
            columns={atRiskColumns}
            isLoading={atRiskLoading}
            emptyState={(
              <div className="py-8 text-center text-sm text-muted-foreground">
                No customers approaching usage limits.
              </div>
            )}
          />
        </div>
      </div>
    </DashboardBody>
  )
}
