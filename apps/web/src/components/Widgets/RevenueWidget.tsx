'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatCurrency } from '@/utils/metrics'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// TODO: Replace with real API data (useMetrics with last 6 months)
const MOCK_REVENUE_DATA = [
  { month: 'Aug', revenue: 345000 },
  { month: 'Sep', revenue: 412000 },
  { month: 'Oct', revenue: 389000 },
  { month: 'Nov', revenue: 567000 },
  { month: 'Dec', revenue: 623000 },
  { month: 'Jan', revenue: 714000 },
]

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-card p-3 shadow-md">
        <p className="text-sm font-medium">
          {formatCurrency(payload[0].value)}
        </p>
      </div>
    )
  }
  return null
}

export const RevenueWidget = () => {
  const totalRevenue = MOCK_REVENUE_DATA.reduce(
    (sum, m) => sum + m.revenue,
    0,
  )
  const prevMonth = MOCK_REVENUE_DATA[MOCK_REVENUE_DATA.length - 2]?.revenue ?? 0
  const currMonth = MOCK_REVENUE_DATA[MOCK_REVENUE_DATA.length - 1]?.revenue ?? 0
  const trend = prevMonth > 0 ? ((currMonth - prevMonth) / prevMonth) * 100 : 0

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-medium">Revenue</h2>
        <p className="text-sm text-muted-foreground">
          Last 6 months revenue overview
        </p>
      </div>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              Total Revenue (6 months)
            </span>
            <span className="text-2xl font-semibold">
              {formatCurrency(totalRevenue)}
            </span>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              trend >= 0
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
            }`}
          >
            {trend >= 0 ? '+' : ''}
            {trend.toFixed(1)}% vs last month
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MOCK_REVENUE_DATA}>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis hide />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: 'hsl(var(--muted))', radius: 4 }}
                />
                <Bar
                  dataKey="revenue"
                  fill="hsl(var(--primary))"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
