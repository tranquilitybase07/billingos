'use client'

import { useState, useMemo } from 'react'
import { Area, AreaChart, XAxis, YAxis } from 'recharts'
import { subDays, subMonths, format } from 'date-fns'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useRevenueTrend } from '@/hooks/queries/analytics'
import { CardGhost, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Skeleton } from '@/components/ui/skeleton'
import type { Granularity } from '@/lib/api/types'

const RANGES = [
  { key: '7d', label: '7D', days: 7, granularity: 'day' as Granularity },
  { key: '30d', label: '30D', days: 30, granularity: 'day' as Granularity },
  { key: '90d', label: '90D', days: 90, granularity: 'week' as Granularity },
  { key: '12mo', label: '12M', months: 12, granularity: 'month' as Granularity },
]

const chartConfig = {
  revenue: {
    label: 'Revenue',
    color: '#0ea5e9',
  },
} satisfies ChartConfig

export function RevenueChart() {
  const { organization } = useOrganization()
  const [range, setRange] = useState('30d')

  const { startDate, endDate, granularity } = useMemo(() => {
    const r = RANGES.find((r) => r.key === range) || RANGES[1]
    const end = new Date()
    const start = r.months
      ? subMonths(end, r.months)
      : subDays(end, r.days!)
    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
      granularity: r.granularity,
    }
  }, [range])

  const { data, isLoading } = useRevenueTrend({
    organization_id: organization.id,
    start_date: startDate,
    end_date: endDate,
    granularity,
  })

  const chartData = useMemo(() => {
    if (!data?.data) return []
    return data.data.map((d) => ({
      date: d.date,
      revenue: d.revenue / 100,
    }))
  }, [data])

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(v)

  return (
    <CardGhost>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Revenue</CardTitle>
        <ToggleGroup
          type="single"
          value={range}
          onValueChange={(v) => v && setRange(v)}
          className="gap-0"
        >
          {RANGES.map((r) => (
            <ToggleGroupItem
              key={r.key}
              value={r.key}
              size="sm"
              className="text-xs px-2.5 h-7"
            >
              {r.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <AreaChart
              data={chartData}
              margin={{ left: 0, right: 0, top: 12, bottom: 0 }}
            >
              <defs>
                <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => {
                  if (granularity === 'month') return v.slice(0, 7)
                  return v.slice(5)
                }}
                className="text-xs"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatCurrency(v)}
                width={60}
                className="text-xs"
              />
              <ChartTooltip
                cursor={false}
                content={(props) => (
                  <ChartTooltipContent
                    {...props}
                    indicator="line"
                    formatter={(value) => formatCurrency(value as number)}
                  />
                )}
              />
              <Area
                dataKey="revenue"
                type="monotone"
                fill="url(#fillRevenue)"
                fillOpacity={0.4}
                stroke="var(--color-revenue)"
                strokeWidth={2}
                isAnimationActive={true}
                animationDuration={800}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </CardGhost>
  )
}
