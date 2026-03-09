import { Flag01Icon, Activity01Icon, HashtagIcon } from 'hugeicons-react'
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
      Icon: Flag01Icon,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      label: 'Flag',
    },
    usage_quota: {
      Icon: Activity01Icon,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      label: 'Quota',
    },
    numeric_limit: {
      Icon: HashtagIcon,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      label: 'Limit',
    },
  }

  const { Icon, color, bgColor, label } = config[type]

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
        <Icon size={12} />
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
      <Icon size={16} className={color} />
    </div>
  )
}
