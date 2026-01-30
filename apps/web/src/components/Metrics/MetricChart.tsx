'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { formatMetricValue, MetricType } from '@/utils/metrics'

export interface MetricDataPoint {
  label: string
  value: number
}

interface MetricChartProps {
  data: MetricDataPoint[]
  height?: number
  metricType: MetricType
  color?: string
}

function CustomTooltip({
  active,
  payload,
  metricType,
}: {
  active?: boolean
  payload?: Array<{ value: number; payload: MetricDataPoint }>
  metricType: MetricType
}) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-card p-3 shadow-md">
        <p className="text-xs text-muted-foreground">
          {payload[0].payload.label}
        </p>
        <p className="text-sm font-medium">
          {formatMetricValue(metricType, payload[0].value)}
        </p>
      </div>
    )
  }
  return null
}

export const MetricChart = ({
  data,
  height = 200,
  metricType,
  color = 'hsl(var(--primary))',
}: MetricChartProps) => {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="hsl(var(--border))"
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            interval="preserveStartEnd"
          />
          <YAxis
            hide
          />
          <Tooltip
            content={<CustomTooltip metricType={metricType} />}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
