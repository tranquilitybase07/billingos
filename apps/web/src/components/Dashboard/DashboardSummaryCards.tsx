'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    DollarSign,
    Users,
    CreditCard,
    Activity,
    UserPlus,
    UserMinus,
} from 'lucide-react'

// Dummy data for now, replacing with real data integration later
const summaryMetrics = [
    {
        title: 'Total Revenue',
        value: '$48,234.00',
        icon: DollarSign,
        description: '+20.1% from last month',
    },
    {
        title: 'MRR',
        value: '$12,234.00',
        icon: CreditCard,
        description: '+4.5% from last month',
    },
    {
        title: 'ARR',
        value: '$146,808.00',
        icon: Activity,
        description: '+12.2% from last year',
    },
    {
        title: 'New Customers',
        value: '+573',
        icon: UserPlus,
        description: '+201 since last hour',
    },
    {
        title: 'Active Subscriptions',
        value: '2,350',
        icon: Users,
        description: '+180 from last month',
    },
    {
        title: 'Churn Rate',
        value: '2.4%',
        icon: UserMinus,
        description: '-1.1% from last month',
    },
]

export function DashboardSummaryCards() {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {summaryMetrics.map((metric) => (
                <Card key={metric.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {metric.title}
                        </CardTitle>
                        <metric.icon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metric.value}</div>
                        <p className="text-xs text-muted-foreground">
                            {metric.description}
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
