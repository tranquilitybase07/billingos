'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Dollar01Icon } from 'hugeicons-react'
import { useMRR } from '@/hooks/queries/analytics'
import { useOrganization } from '@/providers/OrganizationProvider'

const TIERS = [
  { limitMRR: 1_000 },
  { limitMRR: 50_000 },
]

function formatCurrency(value: number): string {
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function getNextMonthFirst(): string {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return next.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function MRRTrackerWidget() {
  const { organization } = useOrganization()
  const { data: mrrData } = useMRR(organization.id)

  const currentMRR = (mrrData?.mrr ?? 0) / 100

  const goalMRR = useMemo(() => {
    const tier = TIERS.find((t) => currentMRR <= t.limitMRR) ?? TIERS[TIERS.length - 1]
    return tier.limitMRR
  }, [currentMRR])

  const progress = Math.min((currentMRR / goalMRR) * 100, 100)
  const resetDate = useMemo(() => getNextMonthFirst(), [])
  const billingHref = `/dashboard/${organization.slug}/settings/billing`

  return (
    <div className="group-data-[collapsible=icon]:hidden flex flex-col w-full gap-2 px-1 pb-3 border-b border-sidebar-border mb-1">
      {/* MRR row */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1 text-muted-foreground font-medium">
            <Dollar01Icon size={12} className="text-muted-foreground/60" />
            MRR
          </div>
          <div className="tabular-nums">
            <span className="font-semibold text-sidebar-foreground">{formatCurrency(currentMRR)}</span>
            <span className="text-muted-foreground"> / {formatCurrency(goalMRR)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-[3px] w-full bg-sidebar-accent rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="h-full bg-sidebar-foreground rounded-full"
          />
        </div>
      </div>

      {/* Reset date */}
      <p className="text-[10px] text-muted-foreground/60 leading-tight">
        Resets {resetDate}
      </p>

      {/* Upgrade CTA */}
      <Link href={billingHref} className="block">
        <motion.span
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center justify-center py-1.5 px-3 bg-sidebar-foreground text-sidebar rounded-md text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
        >
          Upgrade plan
        </motion.span>
      </Link>
    </div>
  )
}
