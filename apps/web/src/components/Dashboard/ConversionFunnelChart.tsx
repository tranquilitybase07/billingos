'use client'

import { useState } from 'react'
import { FunnelChart } from '@/components/charts/funnel-chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useConversionFunnel } from '@/hooks/queries/analytics'

const DISPLAY_ORDER = [0, 2, 1] // Sign-ups → Paying → Free Trial

const STAGE_CFG = [
    { gradient: [{ offset: '0%', color: '#0d9488' }, { offset: '100%', color: '#134e4a' }], accent: '#2dd4bf' },
    { gradient: [{ offset: '0%', color: '#d97706' }, { offset: '100%', color: '#92400e' }], accent: '#fbbf24' },
    { gradient: [{ offset: '0%', color: '#2563eb' }, { offset: '100%', color: '#1e3a8a' }], accent: '#60a5fa' },
]

const MIN_FRACTION = [1.0, 0.40, 0.12]

function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return n.toLocaleString()
}

function pct(a: number, b: number) {
    if (b === 0) return 0
    return Math.round((a / b) * 100)
}

interface ConversionFunnelChartProps {
    organizationId: string
    title?: string
    description?: string
    className?: string
}

export function ConversionFunnelChart({
    organizationId,
    title = 'Conversion Funnel',
    description = 'End-to-end conversion from sign-up to paying customer',
    className,
}: ConversionFunnelChartProps) {
    // Default to first stage selected so detail panel is always populated
    const [selected, setSelected] = useState<number>(0)
    const { data, isLoading } = useConversionFunnel(organizationId)

    const rawStages = data?.stages ?? []
    const overall = data?.overall_conversion_rate ?? 0
    const realMax = Math.max(rawStages[0]?.value ?? 0, 1)

    let prevChartVal = realMax
    const chartStages = DISPLAY_ORDER.map((origIdx, dispIdx) => {
        const s = rawStages[origIdx]
        if (!s) return null
        const cfg = STAGE_CFG[dispIdx] ?? STAGE_CFG[STAGE_CFG.length - 1]!
        const minVal = Math.ceil(realMax * (MIN_FRACTION[dispIdx] ?? 0.05))
        const chartVal = Math.max(Math.min(s.value, prevChartVal), minVal)
        prevChartVal = chartVal
        return {
            label: s.label, value: chartVal, displayValue: fmt(s.value),
            gradient: cfg.gradient, accent: cfg.accent,
            description: s.description, realValue: s.value,
        }
    }).filter((s): s is NonNullable<typeof s> => s !== null)

    const chartMax = chartStages[0]?.value ?? 1
    const realPctMap = new Map(
        chartStages.map(s => [
            Math.round((s.value / chartMax) * 100),
            `${Math.round((s.realValue / realMax) * 100)}%`,
        ])
    )

    const selStage = chartStages[selected]
    const prevStage = selected > 0 ? chartStages[selected - 1] : null
    const stepConv = selStage && prevStage ? pct(selStage.realValue, prevStage.realValue) : null
    const dropOff = stepConv !== null ? 100 - stepConv : null

    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription className="mt-1">{description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-xs text-muted-foreground">Overall Conversion</p>
                            <p className="text-2xl font-bold tabular-nums">{isLoading ? '—' : `${overall}%`}</p>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                            style={{ background: 'var(--chart-1)', opacity: 0.15 }}>
                            <TrendingUp className="h-5 w-5" style={{ color: 'var(--chart-1)' }} />
                        </div>
                    </div>
                </div>
            </CardHeader>

            <CardContent>
                {isLoading ? (
                    <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">Loading funnel data…</div>
                ) : chartStages.length === 0 ? (
                    <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">No customer data yet.</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-6 items-start">

                        {/* Funnel */}
                        <div style={{ height: 260, width: '100%' }}>
                            <FunnelChart
                                data={chartStages}
                                orientation="horizontal"
                                layers={3}
                                staggerDelay={0.12}
                                gap={6}
                                edges="curved"
                                hoveredIndex={selected}
                                onHoverChange={(i) => { if (i !== null) setSelected(i) }}
                                showPercentage
                                showValues
                                showLabels
                                formatValue={fmt}
                                formatPercentage={(p) => realPctMap.get(Math.round(p)) ?? `${Math.round(p)}%`}
                                style={{ width: '100%', height: '100%', aspectRatio: 'unset' }}
                            />
                        </div>

                        {/* Side panel — always visible, updates on click/hover */}
                        <div className="flex flex-col gap-3">

                            {/* Detail card for selected stage */}
                            {selStage && (
                                <div className="rounded-xl border bg-muted/40 p-4 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="h-3 w-3 rounded-full shrink-0" style={{ background: selStage.accent }} />
                                        <span className="font-semibold text-sm">{selStage.label}</span>
                                    </div>
                                    <div className="text-3xl font-bold tabular-nums" style={{ color: selStage.accent }}>
                                        {selStage.displayValue}
                                    </div>
                                    {selStage.description && (
                                        <p className="text-xs text-muted-foreground leading-relaxed">{selStage.description}</p>
                                    )}
                                    {prevStage && stepConv !== null && dropOff !== null && (
                                        <div className="space-y-2 pt-1 border-t">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground flex items-center gap-1">
                                                    <ArrowRight className="h-3 w-3" /> Step conversion
                                                </span>
                                                <Badge variant="secondary" className="font-semibold"
                                                    style={{ color: stepConv >= 50 ? 'var(--chart-2)' : 'var(--chart-5)' }}>
                                                    {stepConv}%
                                                </Badge>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground flex items-center gap-1">
                                                    <TrendingDown className="h-3 w-3" /> Drop-off
                                                </span>
                                                <span className="font-medium text-destructive">{dropOff}%</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Stage list */}
                            <div className="flex flex-col gap-1">
                                {chartStages.map((stage, i) => (
                                    <button
                                        key={stage.label}
                                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-colors"
                                        style={{ background: selected === i ? `${stage.accent}18` : undefined }}
                                        onClick={() => setSelected(i)}
                                    >
                                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: stage.accent }} />
                                        <span className="flex-1 text-muted-foreground truncate">{stage.label}</span>
                                        <span className="font-semibold tabular-nums shrink-0">{stage.displayValue}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
