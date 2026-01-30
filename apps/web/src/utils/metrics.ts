// Metric formatting utilities

export type MetricType = 'scalar' | 'currency'

export interface MetricDefinition {
  slug: string
  display_name: string
  type: MetricType
}

export function formatCurrency(amount: number, currency: string = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100) // amounts stored in cents
}

export function formatScalar(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }
  return value.toLocaleString()
}

export function formatMetricValue(
  type: MetricType,
  value: number,
  currency: string = 'usd',
): string {
  if (type === 'currency') {
    return formatCurrency(value, currency)
  }
  return formatScalar(value)
}
