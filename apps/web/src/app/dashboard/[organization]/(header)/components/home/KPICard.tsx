'use client'

import { useEffect, useRef } from 'react'
import { animate } from 'framer-motion'
import { ArrowUp01Icon, ArrowDown01Icon } from 'hugeicons-react'
import { Area, AreaChart } from 'recharts'
import { CardFlat } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer } from '@/components/ui/chart'

interface KPICardProps {
  label: string
  value: number
  changePercent: number
  sparklineData: number[]
  format: 'currency' | 'integer' | 'percent'
  isLoading: boolean
  color: string
  currencyCode?: string
}

export function KPICard({
  label,
  value,
  changePercent,
  sparklineData,
  format,
  isLoading,
  color,
  currencyCode = 'USD',
}: KPICardProps) {
  const valueRef = useRef<HTMLSpanElement>(null)
  const hasAnimated = useRef(false)

  const formatValue = (v: number) => {
    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currencyCode,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(v / 100)
      case 'percent':
        return `${v.toFixed(1)}%`
      case 'integer':
        return v.toLocaleString()
    }
  }

  useEffect(() => {
    if (isLoading || hasAnimated.current || !valueRef.current) return
    hasAnimated.current = true

    const el = valueRef.current
    const controls = animate(0, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate(v) {
        el.textContent = formatValue(format === 'percent' ? v : Math.round(v))
      },
    })

    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, value])

  const chartData = sparklineData.map((v, i) => ({ i, v }))
  const isPositive = changePercent >= 0
  const isChurnMetric = label.toLowerCase().includes('churn')
  // For churn, positive change is bad (red), negative is good (green)
  const changeColor = isChurnMetric
    ? isPositive ? 'text-red-500' : 'text-green-500'
    : isPositive ? 'text-green-500' : 'text-red-500'

  if (isLoading) {
    return (
      <CardFlat className="p-5">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-3 w-16 mb-3" />
        <Skeleton className="h-10 w-full" />
      </CardFlat>
    )
  }

  return (
    <CardFlat className="p-5 flex flex-col justify-between">
      <div>
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span
            ref={valueRef}
            className="text-2xl font-bold tracking-tight tabular-nums"
          >
            {formatValue(value)}
          </span>
        </div>
        {value === 0 && changePercent === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">
            Complete setup to start tracking
          </p>
        ) : (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${changeColor}`}>
            {isPositive ? (
              <ArrowUp01Icon size={12} />
            ) : (
              <ArrowDown01Icon size={12} />
            )}
            <span>{Math.abs(changePercent).toFixed(1)}%</span>
            <span className="text-muted-foreground font-normal">vs last 30d</span>
          </div>
        )}
      </div>
      {chartData.length > 0 && (
        <div className="mt-3 h-10">
          <ChartContainer
            config={{ v: { label, color } }}
            className="h-full w-full"
          >
            <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`sparkFill-${label.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                dataKey="v"
                type="monotone"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#sparkFill-${label.replace(/\s+/g, '')})`}
                isAnimationActive={true}
                animationDuration={800}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      )}
    </CardFlat>
  )
}
