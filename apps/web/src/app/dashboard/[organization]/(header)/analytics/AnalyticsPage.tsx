'use client'

import { useState } from 'react'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useUsageOverview,
  useUsageByFeature,
  useAtRiskCustomers,
  useUsageTrends,
  useMRR,
} from '@/hooks/queries/analytics'

interface AnalyticsPageProps {
  organizationId: string
  organizationSlug: string
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
  const { data: trends } = useUsageTrends(
    organizationId,
    selectedFeature,
    30,
  )

  // Set first feature as selected when data loads
  if (!selectedFeature && byFeature?.data?.length) {
    setSelectedFeature(byFeature.data[0].feature_key)
  }

  return (
    <DashboardBody>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Analytics</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
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
          </Card>

          <Card>
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
          </Card>

          <Card>
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
          </Card>

          <Card>
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
          </Card>
        </div>

        {/* Usage Trends */}
        <Card>
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
                        className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors relative group"
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
        </Card>

        {/* Per-Feature Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Usage by Feature</CardTitle>
          </CardHeader>
          <CardContent>
            {byFeatureLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : !byFeature?.data?.length ? (
              <p className="text-muted-foreground text-sm">No metered features found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Total Consumed</TableHead>
                    <TableHead className="text-right">Avg/Customer</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                    <TableHead className="text-right">At Limit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byFeature.data.map((f) => (
                    <TableRow key={f.feature_key}>
                      <TableCell className="font-medium">
                        <div>{f.feature_title}</div>
                        <div className="text-xs text-muted-foreground">{f.feature_key}</div>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(f.total_consumed)}</TableCell>
                      <TableCell className="text-right">{formatNumber(f.avg_per_customer)}</TableCell>
                      <TableCell className="text-right">{f.customer_count}</TableCell>
                      <TableCell className="text-right">
                        {f.at_limit_count > 0 ? (
                          <Badge variant="destructive">{f.at_limit_count}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* At-Risk Customers */}
        <Card>
          <CardHeader>
            <CardTitle>
              At-Risk Customers
              {atRisk?.total_at_risk ? (
                <Badge variant="destructive" className="ml-2">{atRisk.total_at_risk}</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {atRiskLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : !atRisk?.data?.length ? (
              <p className="text-muted-foreground text-sm">No customers approaching usage limits.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Usage</TableHead>
                    <TableHead className="text-right">% Used</TableHead>
                    <TableHead className="text-right">Resets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atRisk.data.map((c, i) => (
                    <TableRow key={`${c.customer_id}-${c.feature_key}-${i}`}>
                      <TableCell>
                        <div className="font-medium">{c.email || c.external_id}</div>
                        <div className="text-xs text-muted-foreground">{c.external_id}</div>
                      </TableCell>
                      <TableCell>{c.feature_key}</TableCell>
                      <TableCell className="text-right">
                        {formatNumber(c.consumed)} / {formatNumber(c.limit)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={c.percentage_used >= 100 ? 'destructive' : 'secondary'}>
                          {c.percentage_used}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {new Date(c.resets_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardBody>
  )
}
