import { Flag, Activity, Hash } from 'lucide-react'
import { type FeatureType } from '@/lib/validations/feature'
import { cn } from '@/lib/utils'

interface FeatureTypeIconProps {
  type: FeatureType
  className?: string
  showLabel?: boolean
}

/**
 * Visual indicator for feature types
 * - boolean_flag: Flag icon (blue)
 * - usage_quota: Activity/Gauge icon (green)
 * - numeric_limit: Hash icon (purple)
 */
export function FeatureTypeIcon({
  type,
  className,
  showLabel = false,
}: FeatureTypeIconProps) {
  const config = {
    boolean_flag: {
      icon: Flag,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      label: 'Flag',
    },
    usage_quota: {
      icon: Activity,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      label: 'Quota',
    },
    numeric_limit: {
      icon: Hash,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      label: 'Limit',
    },
  }

  const { icon: Icon, color, bgColor, label } = config[type]

  if (showLabel) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          bgColor,
          color,
          className
        )}
      >
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg',
        bgColor,
        className
      )}
    >
      <Icon className={cn('h-4 w-4', color)} />
    </div>
  )
}
