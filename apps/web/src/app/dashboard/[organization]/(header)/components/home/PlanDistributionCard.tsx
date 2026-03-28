'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PatternLines } from '@visx/pattern'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useProductSubscribers } from '@/hooks/queries/analytics'
import { orgPath } from '@/lib/navigation'
import { CardFlat, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PieChart } from '@/components/charts/pie-chart'
import { PieSlice } from '@/components/charts/pie-slice'
import { PieCenter } from '@/components/charts/pie-center'
import { defaultPieColors, type PieData } from '@/components/charts/pie-context'

const PATTERN_ORIENTATIONS: Array<('diagonal' | 'horizontal' | 'vertical' | 'diagonalRightToLeft')[]> = [
  ['diagonal'],
  ['horizontal'],
  ['vertical'],
  ['diagonalRightToLeft'],
  ['diagonal', 'horizontal'],
]

export function PlanDistributionCard() {
  const { organization } = useOrganization()
  const { data, isLoading } = useProductSubscribers(organization.id)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const pieData = useMemo<PieData[]>(() => {
    if (!data?.data) return []
    return data.data.map((item, index) => ({
      label: item.product_name,
      value: item.subscriber_count,
      color: defaultPieColors[index % defaultPieColors.length],
    }))
  }, [data])

  return (
    <CardFlat className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Plans</CardTitle>
        <Link href={orgPath(organization.slug, '/products')}>
          <Button variant="ghost" size="sm" className="text-xs">
            View All
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-[180px] w-[180px] rounded-full" />
            <div className="w-full space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 rounded-sm" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-8 ml-auto" />
                </div>
              ))}
            </div>
          </div>
        ) : !data?.data.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No active subscriptions yet.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <PieChart
              data={pieData}
              size={180}
              innerRadius={55}
              hoveredIndex={hoveredIndex}
              onHoverChange={setHoveredIndex}
            >
              {pieData.map((_, index) => (
                <PatternLines
                  key={`dp-${index}`}
                  id={`dp-${index}`}
                  height={6}
                  width={6}
                  stroke={defaultPieColors[index % defaultPieColors.length]}
                  strokeWidth={1}
                  orientation={PATTERN_ORIENTATIONS[index % PATTERN_ORIENTATIONS.length]}
                />
              ))}
              {pieData.map((_, index) => (
                <PieSlice key={index} index={index} fill={`url(#dp-${index})`} />
              ))}
              <PieCenter defaultLabel="Subscribers" />
            </PieChart>
            <div className="w-full space-y-2">
              {data.data.map((item, index) => {
                const pct = data.total_subscribers > 0
                  ? Math.round((item.subscriber_count / data.total_subscribers) * 100)
                  : 0
                return (
                  <div key={item.product_id} className="flex items-center gap-2 text-sm">
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: defaultPieColors[index % defaultPieColors.length] }}
                    />
                    <span className="truncate flex-1 text-muted-foreground">
                      {item.product_name}
                    </span>
                    <span className="font-medium tabular-nums">
                      {item.subscriber_count}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                      {pct}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </CardFlat>
  )
}
