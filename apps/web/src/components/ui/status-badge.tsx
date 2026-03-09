import { cn } from '@/lib/utils'

type StatusVariant =
  | 'active'
  | 'inactive'
  | 'warning'
  | 'error'
  | 'pending'
  | 'archived'
  | 'live'
  | 'test'

const variantConfig: Record<
  StatusVariant,
  { dot: string; badge: string; label: string }
> = {
  active: {
    dot: 'bg-green-500',
    badge: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    label: 'Active',
  },
  inactive: {
    dot: 'bg-gray-400',
    badge: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
    label: 'Inactive',
  },
  warning: {
    dot: 'bg-amber-400',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    label: 'Warning',
  },
  error: {
    dot: 'bg-red-500',
    badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    label: 'Error',
  },
  pending: {
    dot: 'bg-amber-400 animate-pulse',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    label: 'Pending',
  },
  archived: {
    dot: 'bg-gray-400',
    badge: 'bg-gray-500/10 text-gray-500 dark:text-gray-500 border-gray-500/20',
    label: 'Archived',
  },
  live: {
    dot: 'bg-green-500',
    badge: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    label: 'Live',
  },
  test: {
    dot: 'bg-gray-400',
    badge: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
    label: 'Test',
  },
}

interface StatusBadgeProps {
  variant: StatusVariant
  label?: string
  className?: string
  showDot?: boolean
}

export function StatusBadge({
  variant,
  label,
  className,
  showDot = true,
}: StatusBadgeProps) {
  const config = variantConfig[variant]
  const displayLabel = label ?? config.label

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        config.badge,
        className,
      )}
    >
      {showDot && (
        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', config.dot)} />
      )}
      {displayLabel}
    </span>
  )
}
