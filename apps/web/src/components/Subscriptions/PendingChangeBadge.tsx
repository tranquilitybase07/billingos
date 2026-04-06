'use client'

import { ArrowDown02Icon } from 'hugeicons-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface PendingChangeBadgeProps {
  newPlanName: string
  scheduledFor: string // ISO date
  newAmount?: number // cents
  newCurrency?: string
  variant?: 'default' | 'compact' | 'icon-only'
  className?: string
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatLongDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100)
}

export function PendingChangeBadge({
  newPlanName,
  scheduledFor,
  newAmount,
  newCurrency,
  variant = 'default',
  className,
}: PendingChangeBadgeProps) {
  const tooltipContent = (
    <div className="space-y-0.5">
      <p className="font-medium">Scheduled downgrade</p>
      <p className="text-xs text-muted-foreground">
        Switches to <span className="font-semibold text-foreground">{newPlanName}</span>
        {newAmount != null && newCurrency && ` (${formatPrice(newAmount, newCurrency)})`}
      </p>
      <p className="text-xs text-muted-foreground">on {formatLongDate(scheduledFor)}</p>
    </div>
  )

  const baseChip =
    'inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 ' +
    'text-amber-700 dark:text-amber-400 font-medium'

  const trigger =
    variant === 'icon-only' ? (
      <span className={cn(baseChip, 'px-1.5 py-0.5 text-[10px]', className)}>
        <ArrowDown02Icon size={11} />
      </span>
    ) : variant === 'compact' ? (
      <span className={cn(baseChip, 'px-1.5 py-0.5 text-[10px]', className)}>
        <ArrowDown02Icon size={11} />
        <span className="truncate max-w-[120px]">{newPlanName}</span>
      </span>
    ) : (
      <span className={cn(baseChip, 'px-2 py-0.5 text-[11px]', className)}>
        <ArrowDown02Icon size={12} />
        <span>
          Downgrades to <span className="font-semibold">{newPlanName}</span>
        </span>
        <span className="text-amber-500/60">·</span>
        <span>{formatShortDate(scheduledFor)}</span>
      </span>
    )

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px]">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
