'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { MetricChart, MetricDataPoint } from './MetricChart'
import { formatMetricValue, MetricType } from '@/utils/metrics'

export interface MetricChartBoxProps {
  title: string
  data: MetricDataPoint[]
  metricType: MetricType
  height?: number
  loading?: boolean
}

export const MetricChartBox = ({
  title,
  data,
  metricType,
  height = 200,
  loading = false,
}: MetricChartBoxProps) => {
  // Calculate total/current value
  const currentValue = data.length > 0 ? data[data.length - 1].value : 0

  // Calculate trend (compare last two periods)
  const previousValue = data.length > 1 ? data[data.length - 2].value : 0
  const trend =
    previousValue > 0
      ? ((currentValue - previousValue) / previousValue) * 100
      : 0

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <div className="flex flex-row items-start justify-between">
          <div className="flex flex-col gap-y-2">
            <span className="text-sm text-muted-foreground">{title}</span>
            <h2 className="text-3xl font-light">
              {formatMetricValue(metricType, currentValue)}
            </h2>
          </div>
          {trend !== 0 && !isNaN(trend) && isFinite(trend) && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                trend > 0
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
              }`}
            >
              {trend > 0 ? '+' : ''}
              {trend.toFixed(0)}%
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div
            style={{ height }}
            className="flex items-center justify-center"
          >
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : data.length > 0 ? (
          <MetricChart data={data} height={height} metricType={metricType} />
        ) : (
          <div
            style={{ height }}
            className="flex items-center justify-center"
          >
            <span className="text-sm text-muted-foreground">
              No data available
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
