'use client'

import { MetricChartBox } from '@/components/Metrics/MetricChartBox'
import { MetricDataPoint } from '@/components/Metrics/MetricChart'
import { MetricType } from '@/utils/metrics'
import { Product } from '@/hooks/queries/products'

// ── Mock Chart Data Generator ──────────────────────────────
// TODO: Replace with real API data from useMetrics hook

function generateMockTimeSeries(
  months: number,
  baseValue: number,
  growth: number,
  variance: number,
): MetricDataPoint[] {
  const data: MetricDataPoint[] = []
  const now = new Date()

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = date.toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    })
    const trendValue = baseValue + growth * (months - i)
    const randomVariance = trendValue * (1 + (Math.random() - 0.5) * variance)
    data.push({ label, value: Math.round(randomVariance) })
  }

  return data
}

// Pre-generate stable mock data
const MOCK_MRR = generateMockTimeSeries(12, 800000, 50000, 0.1)
const MOCK_COMMITTED_MRR = generateMockTimeSeries(12, 950000, 55000, 0.08)
const MOCK_ACTIVE_SUBS = generateMockTimeSeries(12, 30, 2, 0.15)
const MOCK_NEW_SUBS = generateMockTimeSeries(12, 5, 0.5, 0.4)
const MOCK_RENEWED_SUBS = generateMockTimeSeries(12, 25, 1.5, 0.2)
const MOCK_NEW_SUBS_REVENUE = generateMockTimeSeries(12, 150000, 15000, 0.3)
const MOCK_RENEWED_SUBS_REVENUE = generateMockTimeSeries(12, 650000, 35000, 0.15)
const MOCK_ONE_TIME_PRODUCTS = generateMockTimeSeries(12, 20, 3, 0.3)
const MOCK_ONE_TIME_REVENUE = generateMockTimeSeries(12, 400000, 30000, 0.25)
const MOCK_REVENUE = generateMockTimeSeries(12, 900000, 60000, 0.12)
const MOCK_ORDERS = generateMockTimeSeries(12, 40, 3, 0.25)
const MOCK_AOV = generateMockTimeSeries(12, 4500, 100, 0.15)
const MOCK_CUMULATIVE = (() => {
  let cumulative = 0
  return MOCK_REVENUE.map((d) => {
    cumulative += d.value
    return { ...d, value: cumulative }
  })
})()

// ── Metric Definitions ──────────────────────────────────────

interface MetricDef {
  key: string
  title: string
  type: MetricType
  data: MetricDataPoint[]
}

const subscriptionMetrics: MetricDef[] = [
  { key: 'mrr', title: 'Monthly Recurring Revenue', type: 'currency', data: MOCK_MRR },
  { key: 'committed_mrr', title: 'Committed MRR', type: 'currency', data: MOCK_COMMITTED_MRR },
  { key: 'active_subs', title: 'Active Subscriptions', type: 'scalar', data: MOCK_ACTIVE_SUBS },
  { key: 'new_subs', title: 'New Subscriptions', type: 'scalar', data: MOCK_NEW_SUBS },
  { key: 'renewed_subs', title: 'Renewed Subscriptions', type: 'scalar', data: MOCK_RENEWED_SUBS },
  { key: 'new_subs_revenue', title: 'New Subscriptions Revenue', type: 'currency', data: MOCK_NEW_SUBS_REVENUE },
  { key: 'renewed_subs_revenue', title: 'Renewed Subscriptions Revenue', type: 'currency', data: MOCK_RENEWED_SUBS_REVENUE },
]

const oneTimeMetrics: MetricDef[] = [
  { key: 'one_time_products', title: 'One-Time Products', type: 'scalar', data: MOCK_ONE_TIME_PRODUCTS },
  { key: 'one_time_revenue', title: 'One-Time Products Revenue', type: 'currency', data: MOCK_ONE_TIME_REVENUE },
]

const orderMetricsRecurring: MetricDef[] = [
  { key: 'revenue', title: 'Revenue', type: 'currency', data: MOCK_REVENUE },
  { key: 'orders', title: 'Orders', type: 'scalar', data: MOCK_ORDERS },
  { key: 'aov', title: 'Average Order Value', type: 'currency', data: MOCK_AOV },
  { key: 'cumulative_revenue', title: 'Cumulative Revenue', type: 'currency', data: MOCK_CUMULATIVE },
]

const orderMetricsOneTime: MetricDef[] = [
  { key: 'aov', title: 'Average Order Value', type: 'currency', data: MOCK_AOV },
  { key: 'cumulative_revenue', title: 'Cumulative Revenue', type: 'currency', data: MOCK_CUMULATIVE },
]

// ── Component ──────────────────────────────────────────────

export interface ProductMetricsViewProps {
  product: Product
  isRecurring: boolean
}

export const ProductMetricsView = ({
  isRecurring,
}: ProductMetricsViewProps) => {
  const productMetrics = isRecurring ? subscriptionMetrics : oneTimeMetrics
  const orderMetrics = isRecurring ? orderMetricsRecurring : orderMetricsOneTime

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {productMetrics.map((metric) => (
        <MetricChartBox
          key={metric.key}
          title={metric.title}
          data={metric.data}
          metricType={metric.type}
        />
      ))}
      {orderMetrics.map((metric) => (
        <MetricChartBox
          key={metric.key}
          title={metric.title}
          data={metric.data}
          metricType={metric.type}
        />
      ))}
    </div>
  )
}
