'use client'

import { useOrganization } from '@/providers/OrganizationProvider'
import { useMRR, useRevenueTrend, useSubscriptionGrowth, useChurnRate } from '@/hooks/queries/analytics'
import { MetricAreaChart } from './MetricAreaChart'
import { ChartConfig } from '@/components/ui/chart'

export function DashboardAreaCharts() {
    const { organization } = useOrganization()

    // Calculate date range for the last 12 months
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0]

    // Fetch current snapshot metrics
    const { data: mrrData, isLoading: isLoadingMRR } = useMRR(organization.id)

    // Fetch trend metrics with 12 month range
    const queryParams = {
        organization_id: organization.id,
        granularity: 'month' as const,
        start_date: startDate,
        end_date: endDate
    }
    const { data: revenueTrend, isLoading: isLoadingRev } = useRevenueTrend(queryParams)
    const { data: growthTrend, isLoading: isLoadingGrowth } = useSubscriptionGrowth(queryParams)
    const { data: churnTrend, isLoading: isLoadingChurn } = useChurnRate(queryParams)

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount / 100)
    }

    const formatPercent = (value: number) => {
        return `${value.toFixed(1)}%`
    }

    // Helper to fill gaps in time-series data
    const fillGaps = (data: { date: string; value: number }[] | undefined, defaultValue = 0) => {
        if (!data) return []

        const result: { date: string; value: number }[] = []
        const dateMap = new Map(data.map(d => [d.date, d.value]))

        // Generate last 12 months
        for (let i = 11; i >= 0; i--) {
            const d = new Date()
            d.setMonth(d.getMonth() - i)
            const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

            result.push({
                date: dateKey,
                value: dateMap.get(dateKey) ?? defaultValue
            })
        }

        return result
    }

    // Map API data to chart format
    const revData = fillGaps(revenueTrend?.data.map(d => ({ date: d.date, value: d.revenue / 100 })))

    // For MRR trend, we use revenue as proxy but append the current MRR as the last point if it's more accurate
    let mrrTrendData = [...revData]
    if (mrrTrendData.length > 0 && mrrData) {
        // Update the last point with current real MRR
        mrrTrendData[mrrTrendData.length - 1].value = mrrData.mrr / 100
    }

    const growthData = fillGaps(growthTrend?.data.map(d => ({ date: d.date, value: d.net_growth })))
    const activeSubData = growthData // Simple proxy
    const churnData = fillGaps(churnTrend?.data.map(d => ({ date: d.date, value: d.churn_rate })))

    const isLoading = isLoadingMRR || isLoadingRev || isLoadingGrowth || isLoadingChurn

    // Chart configurations and data
    const charts = [
        {
            title: 'Total Revenue',
            value: isLoadingRev ? 'Loading...' : formatCurrency(revenueTrend?.total_revenue || 0),
            description: 'Total revenue (last 12 months)',
            data: revData,
            config: {
                value: {
                    label: 'Revenue',
                    color: '#0ea5e9',
                },
            } satisfies ChartConfig,
        },
        {
            title: 'MRR',
            value: isLoadingMRR ? 'Loading...' : formatCurrency(mrrData?.mrr || 0),
            description: 'Monthly Recurring Revenue',
            data: mrrTrendData,
            config: {
                value: {
                    label: 'MRR',
                    color: '#22c55e',
                },
            } satisfies ChartConfig,
        },
        {
            title: 'ARR',
            value: isLoadingMRR ? 'Loading...' : formatCurrency((mrrData?.mrr || 0) * 12),
            description: 'Annual Recurring Revenue',
            data: mrrTrendData.map(d => ({ ...d, value: d.value * 12 })),
            config: {
                value: {
                    label: 'ARR',
                    color: '#8b5cf6',
                },
            } satisfies ChartConfig,
        },
        {
            title: 'New Customers',
            value: isLoadingGrowth ? '...' : `+${growthTrend?.summary.total_new || 0}`,
            description: 'New customers (last 12 months)',
            data: fillGaps(growthTrend?.data.map(d => ({ date: d.date, value: d.new_subscriptions }))),
            config: {
                value: {
                    label: 'Customers',
                    color: '#f59e0b',
                },
            } satisfies ChartConfig,
        },
        {
            title: 'Active Subscriptions',
            value: isLoadingMRR ? '...' : (mrrData?.active_subscriptions || 0).toString(),
            description: 'Current active subscriptions',
            data: activeSubData,
            config: {
                value: {
                    label: 'Subscriptions',
                    color: '#ec4899',
                },
            } satisfies ChartConfig,
        },
        {
            title: 'Churn Rate',
            value: isLoadingChurn ? '...' : formatPercent(churnTrend?.summary.avg_churn_rate || 0),
            description: 'Average churn rate',
            data: churnData,
            config: {
                value: {
                    label: 'Churn %',
                    color: '#ef4444',
                },
            } satisfies ChartConfig,
        },
    ]

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {charts.map((chart) => (
                <MetricAreaChart
                    key={chart.title}
                    title={chart.title}
                    value={chart.value}
                    description={chart.description}
                    data={chart.data}
                    config={chart.config}
                />
            ))}
        </div>
    )
}
