'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import TimeAgo from 'react-timeago'
import {
  CreditCardIcon,
  Cancel01Icon,
  UserAdd01Icon,
  TestTube01Icon,
} from 'hugeicons-react'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useActivityFeed } from '@/hooks/queries/analytics'
import { orgPath } from '@/lib/navigation'
import { CardFlat, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ActivityFeedItem } from '@/lib/api/types'

const typeConfig: Record<
  ActivityFeedItem['type'],
  { icon: typeof CreditCardIcon; color: string; bgColor: string }
> = {
  new_subscription: { icon: UserAdd01Icon, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  payment_succeeded: { icon: CreditCardIcon, color: 'text-green-500', bgColor: 'bg-green-500/10' },
  subscription_canceled: { icon: Cancel01Icon, color: 'text-red-500', bgColor: 'bg-red-500/10' },
  refund: { icon: CreditCardIcon, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  trial_started: { icon: TestTube01Icon, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  trial_converted: { icon: CreditCardIcon, color: 'text-green-500', bgColor: 'bg-green-500/10' },
  subscription_upgraded: { icon: UserAdd01Icon, color: 'text-teal-500', bgColor: 'bg-teal-500/10' },
  subscription_downgraded: { icon: UserAdd01Icon, color: 'text-teal-500', bgColor: 'bg-teal-500/10' },
}

function formatDescription(item: ActivityFeedItem): string {
  const name = item.customer_name || item.customer_email.split('@')[0]
  switch (item.type) {
    case 'new_subscription':
      return `${name} subscribed to ${item.product_name}`
    case 'payment_succeeded':
      return `${name} paid ${formatAmount(item.amount, item.currency)}`
    case 'subscription_canceled':
      return `${name} canceled ${item.product_name}`
    case 'refund':
      return `Refund issued to ${name} for ${formatAmount(item.amount, item.currency)}`
    case 'trial_started':
      return `${name} started a trial of ${item.product_name}`
    case 'trial_converted':
      return `${name} converted from trial to ${item.product_name}`
    case 'subscription_upgraded':
      return `${name} upgraded to ${item.product_name}`
    case 'subscription_downgraded':
      return `${name} downgraded to ${item.product_name}`
    default:
      return `${name} — ${item.type}`
  }
}

function formatAmount(amount: number | null, currency: string): string {
  if (amount === null) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'usd',
  }).format(amount / 100)
}

const listVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3 } },
}

export function ActivityFeed() {
  const { organization } = useOrganization()
  const { data, isLoading } = useActivityFeed(organization.id, 10)

  return (
    <CardFlat className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
        <Link href={orgPath(organization.slug, '/analytics')}>
          <Button variant="ghost" size="sm" className="text-xs">
            View All
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-3/4 mb-1" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : !data?.data.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No recent activity yet. Events will appear here as customers subscribe and pay.
          </p>
        ) : (
          <motion.div
            className="space-y-1"
            variants={listVariants}
            initial="hidden"
            animate="show"
          >
            {data.data.map((event) => {
              const config = typeConfig[event.type] || typeConfig.new_subscription
              const Icon = config.icon
              return (
                <motion.div
                  key={event.id}
                  variants={itemVariants}
                  className="flex items-start gap-3 rounded-lg p-2 -mx-2"
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${config.bgColor}`}
                  >
                    <Icon size={14} className={config.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">
                      {formatDescription(event)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <TimeAgo date={event.occurred_at} />
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </CardContent>
    </CardFlat>
  )
}
