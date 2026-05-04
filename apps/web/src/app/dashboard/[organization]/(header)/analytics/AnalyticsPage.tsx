'use client'

import { useState, useMemo, useCallback } from 'react'
import { subDays, subMonths, format, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  useRevenueTrend,
  useSubscriptionGrowth,
  useChurnRate,
} from '@/hooks/queries/analytics'
import {
  ChartContainer,
  ChartTooltip,
  AreaChart,
  LineChart,
  BarChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search01Icon,
  Calendar01Icon,
  Cancel01Icon,
  Dollar01Icon,
  UserGroupIcon,
  UserAdd01Icon,
  UserRemove01Icon,
  PercentIcon,
  ChartBarLineIcon,
  Activity01Icon,
  CreditCardIcon,
  ReloadIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  Link01Icon,
  Download01Icon,
} from 'hugeicons-react'
import type {
  Granularity,
  RevenueTrendResponse,
  SubscriptionGrowthResponse,
  ChurnRateResponse,
} from '@/lib/api/types'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface AnalyticsPageProps {
  organizationId: string
  organizationSlug: string
}

type DateRange = 'Today' | 'Last 7 days' | 'Last 30 days' | 'Last 90 days' | 'Last year' | 'Custom'
type ChartType = 'Line' | 'Area' | 'Bar'
type MetricFormat = 'currency' | 'number' | 'percentage'
type MetricSource = 'revenue' | 'subscriptions' | 'churn' | 'none'

interface DataPoint {
  date: string
  chartDate: string
  value: number
}

interface AllData {
  revenue?: RevenueTrendResponse
  subscriptions?: SubscriptionGrowthResponse
  churn?: ChurnRateResponse
}

interface MetricDef {
  id: string
  name: string
  description: string
  category: string
  format: MetricFormat
  color: string
  Icon: React.ElementType
  source: MetricSource
  getPoints: (data: AllData) => DataPoint[]
  getSummary: (data: AllData) => number | null
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function buildDataPoints(
  dates: string[],
  values: (number | null)[],
): DataPoint[] {
  return dates.map((date, i) => ({
    date,
    chartDate: formatChartDate(date),
    value: values[i] ?? 0,
  }))
}

function formatChartDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getDate()} ${months[d.getMonth()]}`
}

export function formatValue(value: number, format: MetricFormat): string {
  if (format === 'currency') {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
  }
  if (format === 'percentage') {
    return `${value.toFixed(2)}%`
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

// ─────────────────────────────────────────────
// Metric definitions — 18 metrics across 6 categories.
// Each metric's data logic is isolated in getPoints/getSummary
// so plugging in Stripe production data is a one-function change.
// ─────────────────────────────────────────────

const METRICS: MetricDef[] = [
  // ── REVENUE ──────────────────────────────
  {
    id: 'mrr',
    name: 'MRR',
    description: 'Monthly Recurring Revenue',
    category: 'REVENUE',
    format: 'currency',
    color: '#6366f1',
    Icon: Dollar01Icon,
    source: 'revenue',
    getPoints: (d) =>
      buildDataPoints(
        d.revenue?.data.map((p) => p.date) ?? [],
        d.revenue?.data.map((p) => p.revenue / 100) ?? [],
      ),
    getSummary: (d) => {
      const pts = d.revenue?.data ?? []
      return pts.length ? pts[pts.length - 1].revenue / 100 : null
    },
  },
  {
    id: 'arr',
    name: 'ARR',
    description: 'Annual Recurring Revenue',
    category: 'REVENUE',
    format: 'currency',
    color: '#8b5cf6',
    Icon: Dollar01Icon,
    source: 'revenue',
    getPoints: (d) =>
      buildDataPoints(
        d.revenue?.data.map((p) => p.date) ?? [],
        d.revenue?.data.map((p) => (p.revenue / 100) * 12) ?? [],
      ),
    getSummary: (d) => {
      const pts = d.revenue?.data ?? []
      return pts.length ? (pts[pts.length - 1].revenue / 100) * 12 : null
    },
  },
  {
    id: 'mrr_growth',
    name: 'MRR Growth Rate',
    description: 'Month-over-month MRR change',
    category: 'REVENUE',
    format: 'percentage',
    color: '#22c55e',
    Icon: ChartBarLineIcon,
    source: 'revenue',
    getPoints: (d) => {
      const pts = d.revenue?.data ?? []
      return pts.slice(1).map((p, i) => ({
        date: p.date,
        chartDate: formatChartDate(p.date),
        value:
          pts[i].revenue === 0
            ? 0
            : ((p.revenue - pts[i].revenue) / Math.abs(pts[i].revenue)) * 100,
      }))
    },
    getSummary: (d) => {
      const pts = d.revenue?.data ?? []
      if (pts.length < 2) return null
      const prev = pts[pts.length - 2].revenue
      return prev === 0 ? null : ((pts[pts.length - 1].revenue - prev) / Math.abs(prev)) * 100
    },
  },

  // ── CUSTOMERS ────────────────────────────
  {
    id: 'active_customers',
    name: 'Active Customers',
    description: 'Currently active paying customers',
    category: 'CUSTOMERS',
    format: 'number',
    color: '#10b981',
    Icon: UserGroupIcon,
    source: 'churn',
    getPoints: (d) =>
      buildDataPoints(
        d.churn?.data.map((p) => p.date) ?? [],
        d.churn?.data.map((p) => p.active_at_start) ?? [],
      ),
    getSummary: (d) => {
      const pts = d.churn?.data ?? []
      return pts.length ? pts[pts.length - 1].active_at_start : null
    },
  },
  {
    id: 'new_customers',
    name: 'New Customers',
    description: 'New customers acquired in the period',
    category: 'CUSTOMERS',
    format: 'number',
    color: '#34d399',
    Icon: UserAdd01Icon,
    source: 'subscriptions',
    getPoints: (d) =>
      buildDataPoints(
        d.subscriptions?.data.map((p) => p.date) ?? [],
        d.subscriptions?.data.map((p) => p.new_subscriptions) ?? [],
      ),
    getSummary: (d) => d.subscriptions?.summary.total_new ?? null,
  },
  {
    id: 'churned_customers',
    name: 'Churned Customers',
    description: 'Customers who cancelled their subscription',
    category: 'CUSTOMERS',
    format: 'number',
    color: '#ef4444',
    Icon: UserRemove01Icon,
    source: 'subscriptions',
    getPoints: (d) =>
      buildDataPoints(
        d.subscriptions?.data.map((p) => p.date) ?? [],
        d.subscriptions?.data.map((p) => p.canceled_subscriptions) ?? [],
      ),
    getSummary: (d) => d.subscriptions?.summary.total_canceled ?? null,
  },

  // ── CHURN & RETENTION ────────────────────
  {
    id: 'churn_rate',
    name: 'Customer Churn Rate',
    description: 'Percentage of customers who cancelled',
    category: 'CHURN & RETENTION',
    format: 'percentage',
    color: '#f43f5e',
    Icon: PercentIcon,
    source: 'churn',
    getPoints: (d) =>
      buildDataPoints(
        d.churn?.data.map((p) => p.date) ?? [],
        d.churn?.data.map((p) => p.churn_rate) ?? [],
      ),
    getSummary: (d) => d.churn?.summary.avg_churn_rate ?? null,
  },
  {
    id: 'revenue_churn',
    name: 'Revenue Churn Rate',
    description: 'Percentage of revenue lost from cancellations',
    category: 'CHURN & RETENTION',
    format: 'percentage',
    color: '#fb7185',
    Icon: PercentIcon,
    source: 'none',
    getPoints: () => [],
    getSummary: () => null,
  },
  {
    id: 'net_revenue_retention',
    name: 'Net Revenue Retention',
    description: 'Revenue retained from existing customers',
    category: 'CHURN & RETENTION',
    format: 'percentage',
    color: '#0ea5e9',
    Icon: ReloadIcon,
    source: 'churn',
    getPoints: (d) =>
      buildDataPoints(
        d.churn?.data.map((p) => p.date) ?? [],
        d.churn?.data.map((p) => p.retention_rate) ?? [],
      ),
    getSummary: (d) => d.churn?.summary.avg_retention_rate ?? null,
  },

  // ── GROWTH ───────────────────────────────
  {
    id: 'trial_to_paid',
    name: 'Trial → Paid Rate',
    description: 'Conversion rate from trial to paid',
    category: 'GROWTH',
    format: 'percentage',
    color: '#3b82f6',
    Icon: Activity01Icon,
    source: 'none',
    getPoints: () => [],
    getSummary: () => null,
  },
  {
    id: 'activation_rate',
    name: 'Activation Rate',
    description: 'Rate of customers completing onboarding',
    category: 'GROWTH',
    format: 'percentage',
    color: '#a78bfa',
    Icon: ChartBarLineIcon,
    source: 'none',
    getPoints: () => [],
    getSummary: () => null,
  },
  {
    id: 'customer_growth_rate',
    name: 'Customer Growth Rate',
    description: 'Net change in customer count per period',
    category: 'GROWTH',
    format: 'number',
    color: '#34d399',
    Icon: CreditCardIcon,
    source: 'subscriptions',
    getPoints: (d) =>
      buildDataPoints(
        d.subscriptions?.data.map((p) => p.date) ?? [],
        d.subscriptions?.data.map((p) => p.net_growth) ?? [],
      ),
    getSummary: (d) => d.subscriptions?.summary.net_growth ?? null,
  },

  // ── UNIT ECONOMICS ───────────────────────
  {
    id: 'arpu',
    name: 'ARPU',
    description: 'Average Revenue Per User',
    category: 'UNIT ECONOMICS',
    format: 'currency',
    color: '#f59e0b',
    Icon: Dollar01Icon,
    source: 'none',
    getPoints: () => [],
    getSummary: () => null,
  },
  {
    id: 'ltv',
    name: 'Customer LTV',
    description: 'Average lifetime value of a customer',
    category: 'UNIT ECONOMICS',
    format: 'currency',
    color: '#84cc16',
    Icon: Dollar01Icon,
    source: 'none',
    getPoints: () => [],
    getSummary: () => null,
  },
  {
    id: 'cac',
    name: 'CAC',
    description: 'Customer Acquisition Cost',
    category: 'UNIT ECONOMICS',
    format: 'currency',
    color: '#ec4899',
    Icon: Dollar01Icon,
    source: 'none',
    getPoints: () => [],
    getSummary: () => null,
  },
  {
    id: 'ltv_cac',
    name: 'LTV:CAC Ratio',
    description: 'Ratio of lifetime value to acquisition cost',
    category: 'UNIT ECONOMICS',
    format: 'number',
    color: '#8b5cf6',
    Icon: ChartBarLineIcon,
    source: 'none',
    getPoints: () => [],
    getSummary: () => null,
  },

  // ── PAYMENT HEALTH ───────────────────────
  {
    id: 'failed_payment_rate',
    name: 'Failed Payment Rate',
    description: 'Percentage of payments that failed',
    category: 'PAYMENT HEALTH',
    format: 'percentage',
    color: '#ef4444',
    Icon: PercentIcon,
    source: 'none',
    getPoints: () => [],
    getSummary: () => null,
  },
  {
    id: 'recovery_rate',
    name: 'Recovery Rate',
    description: 'Percentage of failed payments recovered',
    category: 'PAYMENT HEALTH',
    format: 'percentage',
    color: '#22c55e',
    Icon: ReloadIcon,
    source: 'none',
    getPoints: () => [],
    getSummary: () => null,
  },
]

const CATEGORIES = [
  'REVENUE',
  'CUSTOMERS',
  'CHURN & RETENTION',
  'GROWTH',
  'UNIT ECONOMICS',
  'PAYMENT HEALTH',
]

// ─────────────────────────────────────────────
// Date range helpers
// ─────────────────────────────────────────────

const DATE_PRESETS: { label: string; value: DateRange }[] = [
  { label: 'Today', value: 'Today' },
  { label: '7D', value: 'Last 7 days' },
  { label: '30D', value: 'Last 30 days' },
  { label: '90D', value: 'Last 90 days' },
  { label: '1Y', value: 'Last year' },
]

function getDateRange(
  range: DateRange,
  customStart?: string,
  customEnd?: string,
): { startDate: string; endDate: string; granularity: Granularity } {
  const today = new Date()
  const end = format(today, 'yyyy-MM-dd')

  switch (range) {
    case 'Today':
      return { startDate: end, endDate: end, granularity: 'day' }
    case 'Last 7 days':
      return { startDate: format(subDays(today, 7), 'yyyy-MM-dd'), endDate: end, granularity: 'day' }
    case 'Last 30 days':
      return { startDate: format(subDays(today, 30), 'yyyy-MM-dd'), endDate: end, granularity: 'day' }
    case 'Last 90 days':
      return { startDate: format(subDays(today, 90), 'yyyy-MM-dd'), endDate: end, granularity: 'week' }
    case 'Last year':
      return { startDate: format(subMonths(today, 12), 'yyyy-MM-dd'), endDate: end, granularity: 'month' }
    case 'Custom': {
      const s = customStart || end
      const e = customEnd || end
      const diff = differenceInDays(new Date(e + 'T00:00:00'), new Date(s + 'T00:00:00'))
      const granularity: Granularity = diff <= 31 ? 'day' : diff <= 91 ? 'week' : 'month'
      return { startDate: s, endDate: e, granularity }
    }
  }
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function AnalyticsPage({ organizationId }: AnalyticsPageProps) {
  const [selectedMetricId, setSelectedMetricId] = useState<string>('mrr')
  const [dateRange, setDateRange] = useState<DateRange>('Last 90 days')
  const [chartType, setChartType] = useState<ChartType>('Line')
  const [isChartTypeOpen, setIsChartTypeOpen] = useState(false)

  // Custom date state — localStart/End are pending; customStart/End are applied
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [localStart, setLocalStart] = useState('')
  const [localEnd, setLocalEnd] = useState('')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Sidebar state
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    REVENUE: true,
    CUSTOMERS: true,
    'CHURN & RETENTION': true,
    GROWTH: true,
    'UNIT ECONOMICS': true,
    'PAYMENT HEALTH': true,
  })

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }, [])

  const handlePresetClick = useCallback((range: DateRange) => {
    setShowCustomPicker(false)
    setDateRange(range)
  }, [])

  const handleApplyCustom = useCallback(() => {
    if (!localStart || !localEnd) return
    setCustomStartDate(localStart)
    setCustomEndDate(localEnd)
    setDateRange('Custom')
    setShowCustomPicker(false)
  }, [localStart, localEnd])

  const isCustomActive = dateRange === 'Custom' && customStartDate && customEndDate

  // Compute query params
  const { startDate, endDate, granularity } = useMemo(
    () => getDateRange(dateRange, customStartDate, customEndDate),
    [dateRange, customStartDate, customEndDate],
  )

  const queryParams = useMemo(
    () => ({ organization_id: organizationId, start_date: startDate, end_date: endDate, granularity }),
    [organizationId, startDate, endDate, granularity],
  )

  const { data: revenueData, isLoading: revenueLoading } = useRevenueTrend(queryParams)
  const { data: subscriptionsData, isLoading: subscriptionsLoading } = useSubscriptionGrowth(queryParams)
  const { data: churnData, isLoading: churnLoading } = useChurnRate(queryParams)

  const allData: AllData = useMemo(
    () => ({ revenue: revenueData, subscriptions: subscriptionsData, churn: churnData }),
    [revenueData, subscriptionsData, churnData],
  )

  const selectedMetric = useMemo(
    () => METRICS.find((m) => m.id === selectedMetricId) ?? METRICS[0],
    [selectedMetricId],
  )

  const chartData = useMemo(
    () => selectedMetric.getPoints(allData),
    [selectedMetric, allData],
  )

  const isLoading =
    (selectedMetric.source === 'revenue' && revenueLoading) ||
    (selectedMetric.source === 'subscriptions' && subscriptionsLoading) ||
    (selectedMetric.source === 'churn' && churnLoading)

  const yDomain = useMemo(() => {
    if (!chartData.length) return undefined
    const values = chartData.map((d) => d.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const padding = (max - min) * 0.1
    return [
      selectedMetric.format === 'percentage' ? 0 : Math.max(0, min - padding),
      max + padding,
    ] as [number, number]
  }, [chartData, selectedMetric.format])

  const chartConfig = useMemo<ChartConfig>(
    () => ({ value: { label: selectedMetric.name, color: selectedMetric.color } }),
    [selectedMetric.name, selectedMetric.color],
  )

  const filteredMetrics = useMemo(
    () =>
      METRICS.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.description.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [searchQuery],
  )

  const tableAverage = useMemo(() => {
    if (!chartData.length) return 0
    return chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length
  }, [chartData])

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).catch(() => {})
  }, [])

  const handleExport = useCallback(() => {
    if (!chartData.length) return
    const header = ['Date', selectedMetric.name].join(',')
    const rows = chartData.map((d) => [d.date, d.value].join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedMetric.id}_${startDate}_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [chartData, selectedMetric, startDate, endDate])

  return (
    <div className="flex h-full w-full min-h-0">
      {/* ── Left: Metrics sidebar (w-56 matching prototype) ── */}
      <aside className="w-56 shrink-0 border-r border-border flex flex-col min-h-0 bg-sidebar">
        {/* Sidebar header */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-sidebar-foreground">Charts</h2>
          </div>
          <div className="text-xs text-muted-foreground mb-3">{METRICS.length} key metrics</div>

          {/* Search */}
          <div className="relative">
            <Search01Icon
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="text"
              placeholder="Search metrics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 text-sm bg-sidebar-accent/30 border-sidebar-border focus:border-primary"
            />
          </div>
        </div>

        {/* Metric list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 pt-1">
          {CATEGORIES.map((category) => {
            const categoryMetrics = filteredMetrics.filter((m) => m.category === category)
            if (categoryMetrics.length === 0) return null
            const isExpanded = expandedCategories[category]

            return (
              <div key={category} className="mb-1">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
                >
                  <div className="flex items-center gap-1">
                    {isExpanded
                      ? <ArrowDown01Icon size={12} />
                      : <ArrowRight01Icon size={12} />
                    }
                    {category}
                  </div>
                  <span className="text-[10px]">{categoryMetrics.length}</span>
                </button>

                {isExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {categoryMetrics.map((metric) => {
                      const isSelected = selectedMetricId === metric.id
                      return (
                        <button
                          key={metric.id}
                          onClick={() => setSelectedMetricId(metric.id)}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors',
                            isSelected
                              ? 'bg-primary/20 text-sidebar-foreground'
                              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent',
                          )}
                        >
                          <div
                            className="w-4 h-4 rounded-sm flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${metric.color}20`, color: metric.color }}
                          >
                            <metric.Icon size={10} />
                          </div>
                          <span className="truncate text-[13px]">{metric.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      {/* ── Right: Main content (header + controls fixed, chart+table scroll) ── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Fixed header — metric name + Share + Export buttons */}
        <header className="flex items-start justify-between p-6 pb-0 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">{selectedMetric.name}</h1>
            <p className="text-sm text-muted-foreground">{selectedMetric.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground bg-card border border-border hover:border-border/80 rounded-md transition-colors"
            >
              <Link01Icon size={14} />
              Share
            </button>
            <button
              onClick={handleExport}
              disabled={selectedMetric.source === 'none' || chartData.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
            >
              <Download01Icon size={14} />
              Export
            </button>
          </div>
        </header>

        {/* Fixed chart controls row */}
        <div className="px-6 mt-6 flex justify-end items-center gap-3 shrink-0">
          {/* Date filter */}
          <div className="flex items-center gap-2">
            {/* Preset pills */}
            <div className="flex items-center bg-card border border-border rounded-lg p-0.5">
              {DATE_PRESETS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => handlePresetClick(value)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-md transition-all',
                    dateRange === value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom date picker */}
            <div className="relative">
              <button
                onClick={() => setShowCustomPicker((s) => !s)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors',
                  isCustomActive
                    ? 'bg-primary/20 border-primary text-foreground'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80',
                )}
              >
                <Calendar01Icon size={13} />
                {isCustomActive ? (
                  <span>
                    {formatDisplayDate(customStartDate)} – {formatDisplayDate(customEndDate)}
                  </span>
                ) : (
                  <span>Custom</span>
                )}
              </button>

              {showCustomPicker && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowCustomPicker(false)}
                  />
                  <div className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-2xl z-20 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-foreground">Custom Range</span>
                      <button
                        onClick={() => setShowCustomPicker(false)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Cancel01Icon size={14} />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1.5">Start date</label>
                        <Input
                          type="date"
                          value={localStart}
                          onChange={(e) => setLocalStart(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1.5">End date</label>
                        <Input
                          type="date"
                          value={localEnd}
                          onChange={(e) => setLocalEnd(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Button
                        onClick={handleApplyCustom}
                        disabled={!localStart || !localEnd}
                        className="w-full h-9 text-sm"
                      >
                        Apply Range
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Chart type dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsChartTypeOpen((s) => !s)}
              className="flex items-center gap-2 bg-card border border-border hover:border-border/80 text-foreground text-sm px-3 py-1.5 rounded-md transition-colors"
            >
              <span>{chartType}</span>
              <ArrowDown01Icon size={14} className="text-muted-foreground" />
            </button>

            {isChartTypeOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsChartTypeOpen(false)} />
                <div className="absolute right-0 mt-1 w-32 bg-card border border-border rounded-md shadow-xl z-20 py-1">
                  {(['Line', 'Area', 'Bar'] as ChartType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => { setChartType(type); setIsChartTypeOpen(false) }}
                      className={cn(
                        'w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors',
                        chartType === type ? 'text-primary font-medium' : 'text-foreground',
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Scrollable content — chart + data table (matches prototype's flex-1 overflow-y-auto) */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Chart */}
          <div className="h-[400px] w-full mt-8">
            {selectedMetric.source === 'none' ? (
              <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/30">
                <div className="text-center">
                  <div className="text-sm font-medium text-muted-foreground">Coming soon</div>
                  <div className="text-xs text-muted-foreground/60 mt-1 max-w-56">
                    This metric will be available once Stripe production data is connected.
                  </div>
                </div>
              </div>
            ) : isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/30">
                <p className="text-sm text-muted-foreground">No data for this period</p>
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-full w-full">
                {chartType === 'Line' ? (
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="chartDate"
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      minTickGap={30}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      tickFormatter={(v) => formatValue(v, selectedMetric.format)}
                      domain={yDomain}
                      width={60}
                    />
                    <ChartTooltip content={<CustomTooltip metric={selectedMetric} />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={selectedMetric.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: selectedMetric.color, strokeWidth: 2 }}
                      isAnimationActive
                      animationDuration={600}
                    />
                  </LineChart>
                ) : chartType === 'Area' ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="analyticsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={selectedMetric.color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={selectedMetric.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="chartDate"
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      minTickGap={30}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      tickFormatter={(v) => formatValue(v, selectedMetric.format)}
                      domain={yDomain}
                      width={60}
                    />
                    <ChartTooltip content={<CustomTooltip metric={selectedMetric} />} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={selectedMetric.color}
                      fill="url(#analyticsAreaGrad)"
                      fillOpacity={1}
                      strokeWidth={2}
                      isAnimationActive
                      animationDuration={600}
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="chartDate"
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      minTickGap={30}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      tickFormatter={(v) => formatValue(v, selectedMetric.format)}
                      domain={yDomain}
                      width={60}
                    />
                    <ChartTooltip content={<CustomTooltip metric={selectedMetric} />} />
                    <Bar
                      dataKey="value"
                      fill={selectedMetric.color}
                      radius={[2, 2, 0, 0]}
                      isAnimationActive
                      animationDuration={600}
                    />
                  </BarChart>
                )}
              </ChartContainer>
            )}
          </div>

          {/* Data table — horizontal layout (dates as columns, matches prototype DataTable) */}
          {selectedMetric.source !== 'none' && chartData.length > 0 && (
            <div className="mt-8 border-t border-border pt-4">
              <div className="text-xs text-muted-foreground mb-4">
                {selectedMetric.name} (by date)
              </div>
              <div className="overflow-x-auto pb-4">
                <div className="min-w-max">
                  <div className="flex items-center border-b border-border pb-2">
                    <div className="w-48 sticky left-0 bg-background z-10 text-xs text-muted-foreground font-medium">
                      Metric
                    </div>
                    {chartData.map((d, i) => (
                      <div key={i} className="w-24 text-right text-xs text-muted-foreground">
                        {d.date}
                      </div>
                    ))}
                    <div className="w-24 text-right text-xs text-muted-foreground font-medium sticky right-0 bg-background z-10 pl-4">
                      Average
                    </div>
                  </div>
                  <div className="flex items-center pt-3">
                    <div className="w-48 sticky left-0 bg-background z-10 flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: selectedMetric.color }}
                      />
                      <span className="text-sm text-foreground">{selectedMetric.name}</span>
                    </div>
                    {chartData.map((d, i) => (
                      <div key={i} className="w-24 text-right text-sm text-foreground">
                        {formatValue(d.value, selectedMetric.format)}
                      </div>
                    ))}
                    <div className="w-24 text-right text-sm text-foreground font-medium sticky right-0 bg-background z-10 pl-4">
                      {formatValue(tableAverage, selectedMetric.format)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────
// Custom tooltip
// ─────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  metric: MetricDef
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border p-3 rounded-md shadow-lg">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      <p className="text-foreground font-semibold flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: metric.color }}
        />
        {formatValue(payload[0].value, metric.format)}
      </p>
    </div>
  )
}
