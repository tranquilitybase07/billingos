'use client'

import { MetricAreaChart } from './MetricAreaChart'
import { ChartConfig } from '@/components/ui/chart'

// Dummy data generator
const generateData = (base: number, volatility: number) => {
    return Array.from({ length: 12 }, (_, i) => {
        const date = new Date(2024, i, 1).toLocaleString('default', { month: 'short' })
        const value = base + Math.random() * volatility - volatility / 2
        return { date, value: Math.max(0, Math.floor(value)) }
    })
}

// Chart configurations and data
const charts = [
    {
        title: 'Total Revenue',
        value: '$48,234.00',
        description: '+20.1% from last month',
        data: generateData(45000, 5000),
        config: {
            value: {
                label: 'Revenue',
                color: '#0ea5e9', // Sky 500
            },
        } satisfies ChartConfig,
    },
    {
        title: 'MRR',
        value: '$12,234.00',
        description: '+4.5% from last month',
        data: generateData(12000, 1000),
        config: {
            value: {
                label: 'MRR',
                color: '#22c55e', // Green 500
            },
        } satisfies ChartConfig,
    },
    {
        title: 'ARR',
        value: '$146,808.00',
        description: '+12.2% from last year',
        data: generateData(140000, 8000),
        config: {
            value: {
                label: 'ARR',
                color: '#8b5cf6', // Violet 500
            },
        } satisfies ChartConfig,
    },
    {
        title: 'New Customers',
        value: '+573',
        description: '+201 since last hour',
        data: generateData(500, 100),
        config: {
            value: {
                label: 'Customers',
                color: '#f59e0b', // Amber 500
            },
        } satisfies ChartConfig,
    },
    {
        title: 'Active Subscriptions',
        value: '2,350',
        description: '+180 from last month',
        data: generateData(2200, 300),
        config: {
            value: {
                label: 'Subscriptions',
                color: '#ec4899', // Pink 500
            },
        } satisfies ChartConfig,
    },
    {
        title: 'Churn Rate',
        value: '2.4%',
        description: '-1.1% from last month',
        data: generateData(2.5, 0.5), // Small numbers for percentage
        config: {
            value: {
                label: 'Churn %',
                color: '#ef4444', // Red 500
            },
        } satisfies ChartConfig,
    },
]

export function DashboardAreaCharts() {
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
