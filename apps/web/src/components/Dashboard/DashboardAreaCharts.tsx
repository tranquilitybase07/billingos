'use client'

import { useOrganization } from '@/providers/OrganizationProvider'
import { useMRR, useMRRTrend, useRevenueTrend, useSubscriptionGrowth, useChurnRate } from '@/hooks/queries/analytics'
import { MetricAreaChart } from './MetricAreaChart'
import { ChartConfig } from '@/components/ui/chart'

export function DashboardAreaCharts() {
    const { organization } = useOrganization()

    // Calculate date ranges
    const endDate = new Date().toISOString().split('T')[0]
    // 12 months for high-level trends
    const startDate12m = new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0]
    // 90 days for detailed trends (daily)
    const startDate90d = new Date(new Date().setDate(new Date().getDate() - 90)).toISOString().split('T')[0]

    // Fetch current snapshot metrics
    const { data: mrrData, isLoading: isLoadingMRR } = useMRR(organization.id)

    // Detailed trend metrics (90 days, daily)
    const detailedParams = {
        organization_id: organization.id,
        granularity: 'day' as const,
        start_date: startDate90d,
        end_date: endDate
    }
    const { data: mrrDetailedTrend, isLoading: isLoadingMRRTrend } = useMRRTrend(detailedParams)

    // High-level trend metrics (12 months, monthly)
    const summaryParams = {
        organization_id: organization.id,
        granularity: 'month' as const,
        start_date: startDate12m,
        end_date: endDate
    }
    const { data: revenueTrend, isLoading: isLoadingRev } = useRevenueTrend(summaryParams)
    const { data: growthTrend, isLoading: isLoadingGrowth } = useSubscriptionGrowth(summaryParams)
    const { data: churnTrend, isLoading: isLoadingChurn } = useChurnRate(summaryParams)

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
    const fillGaps = (
        data: { date: string; value: number }[] | undefined,
        granularity: 'day' | 'month' = 'month',
        defaultValue = 0
    ) => {
        if (!data) return []

        const result: { date: string; value: number }[] = []
        const dateMap = new Map(data.map(d => [d.date, d.value]))

        if (granularity === 'month') {
            for (let i = 11; i >= 0; i--) {
                const d = new Date()
                d.setMonth(d.getMonth() - i)
                const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

                // For trends, we often want to carry forward the last value if data is missing
                const value = dateMap.get(dateKey) ?? (result.length > 0 ? result[result.length - 1].value : defaultValue)
                result.push({ date: dateKey, value })
            }
        } else {
            // Day granularity for last 90 days
            for (let i = 89; i >= 0; i--) {
                const d = new Date()
                d.setDate(d.getDate() - i)
                const dateKey = d.toISOString().split('T')[0]

                const value = dateMap.get(dateKey) ?? (result.length > 0 ? result[result.length - 1].value : defaultValue)
                result.push({ date: dateKey, value })
            }
        }

        return result
    }

    // Map MRR trend data (from daily endpoint)
    const mrrTrendData = fillGaps(
        mrrDetailedTrend?.data.map(d => ({ date: d.date, value: d.mrr / 100 })),
        'day'
    )

    // Active subscriptions from daily endpoint
    const activeSubData = fillGaps(
        mrrDetailedTrend?.data.map(d => ({ date: d.date, value: d.active_subscriptions })),
        'day'
    )

    // Revenue trend data (monthly)
    const revData = fillGaps(revenueTrend?.data.map(d => ({ date: d.date, value: d.revenue / 100 })), 'month')

    // Churn and Growth (monthly)
    const growthData = fillGaps(growthTrend?.data.map(d => ({ date: d.date, value: d.new_subscriptions })), 'month')
    const churnData = fillGaps(churnTrend?.data.map(d => ({ date: d.date, value: d.churn_rate })), 'month')

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
            description: 'Monthly Recurring Revenue (90d trend)',
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
            description: 'Annual Recurring Revenue (90d trend)',
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
            data: growthData,
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
            description: 'Current active subscriptions (90d trend)',
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
            description: 'Average churn rate (last 12 months)',
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
