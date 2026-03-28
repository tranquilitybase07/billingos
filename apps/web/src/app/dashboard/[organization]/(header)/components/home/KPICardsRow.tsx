'use client'

import { motion } from 'framer-motion'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useDashboardOverview } from '@/hooks/queries/analytics'
import { KPICard } from './KPICard'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

export function KPICardsRow() {
  const { organization } = useOrganization()
  const { data, isLoading } = useDashboardOverview(organization.id)

  const cards = [
    {
      label: 'MRR',
      value: data?.mrr.current ?? 0,
      changePercent: data?.mrr.change_percent ?? 0,
      sparklineData: data?.mrr.sparkline ?? [],
      format: 'currency' as const,
      color: '#22c55e',
    },
    {
      label: 'Active Subscriptions',
      value: data?.active_subscriptions.current ?? 0,
      changePercent: data?.active_subscriptions.change_percent ?? 0,
      sparklineData: data?.active_subscriptions.sparkline ?? [],
      format: 'integer' as const,
      color: '#0ea5e9',
    },
    {
      label: 'New Customers',
      value: data?.new_customers.current ?? 0,
      changePercent: data?.new_customers.change_percent ?? 0,
      sparklineData: data?.new_customers.sparkline ?? [],
      format: 'integer' as const,
      color: '#f59e0b',
    },
    {
      label: 'Churn Rate',
      value: data?.churn_rate.current ?? 0,
      changePercent: data?.churn_rate.change_percent ?? 0,
      sparklineData: data?.churn_rate.sparkline ?? [],
      format: 'percent' as const,
      color: '#ef4444',
    },
  ]

  return (
    <motion.div
      className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {cards.map((card) => (
        <motion.div key={card.label} variants={item}>
          <KPICard {...card} isLoading={isLoading} currencyCode={data?.currency || organization.default_currency || 'usd'} />
        </motion.div>
      ))}
    </motion.div>
  )
}
