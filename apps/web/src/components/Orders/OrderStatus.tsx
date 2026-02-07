'use client'

import { Badge } from '@/components/ui/badge'

const statusConfig: Record<string, { label: string; className: string }> = {
  paid: {
    label: 'Paid',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  },
  pending: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  },
  refunded: {
    label: 'Refunded',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  },
  partially_refunded: {
    label: 'Partially Refunded',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  },
}

export const OrderStatus = ({ status }: { status: string }) => {
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
