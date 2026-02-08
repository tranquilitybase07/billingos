'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatMetricValue, MetricType } from '@/utils/metrics'

export interface MiniMetricChartBoxProps {
  title: string
  value: number
  type: MetricType
  currency?: string
  isLoading?: boolean
}

export const MiniMetricChartBox = ({
  title,
  value,
  type,
  currency = 'usd',
  isLoading = false,
}: MiniMetricChartBoxProps) => {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <h3 className="text-2xl font-semibold">
            {formatMetricValue(type, value, currency)}
          </h3>
        )}
      </CardContent>
    </Card>
  )
}
