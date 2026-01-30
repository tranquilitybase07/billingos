'use client'

import { Badge } from '@/components/ui/badge'

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  },
  trialing: {
    label: 'Trialing',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  },
  past_due: {
    label: 'Past Due',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  },
  canceled: {
    label: 'Canceled',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  },
  unpaid: {
    label: 'Unpaid',
    className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  },
  incomplete: {
    label: 'Incomplete',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  },
}

export const SubscriptionStatus = ({ status }: { status: string }) => {
  const config = statusConfig[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700',
  }

  return (
    <Badge variant="secondary" className={config.className}>
      {config.label}
    </Badge>
  )
}
