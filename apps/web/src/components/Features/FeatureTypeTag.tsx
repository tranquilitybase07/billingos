'use client'

import { Badge } from '@/components/ui/badge'
import { FEATURE_TYPE_INFO } from '@/lib/constants/feature-templates'
import { type FeatureType } from '@/lib/validations/feature'
import { cn } from '@/lib/utils'

interface FeatureTypeTagProps {
  type: FeatureType | string
  className?: string
  showIcon?: boolean
}

/**
 * Display badge for feature types with appropriate styling
 */
export function FeatureTypeTag({
  type,
  className,
  showIcon = true
}: FeatureTypeTagProps) {
  const info = FEATURE_TYPE_INFO[type as FeatureType]

  if (!info) {
    // Fallback for unknown types
    return (
      <Badge variant="outline" className={className}>
        {type}
      </Badge>
    )
  }

  const Icon = info.icon

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5',
        type === 'boolean_flag' && 'border-blue-500/50 text-blue-700 dark:text-blue-400',
        type === 'usage_quota' && 'border-orange-500/50 text-orange-700 dark:text-orange-400',
        type === 'numeric_limit' && 'border-purple-500/50 text-purple-700 dark:text-purple-400',
        className
      )}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {info.label}
    </Badge>
  )
}