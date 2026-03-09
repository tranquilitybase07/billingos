import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface EmptyStateAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'outline' | 'secondary'
}

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  className?: string
  size?: 'sm' | 'default'
}

/**
 * Standardized empty state component used across all pages.
 * Provides consistent layout: icon + title + description + optional CTA.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'default',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'default' ? 'py-16 px-8' : 'py-8 px-4',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'text-muted-foreground/30 mb-4',
            size === 'default' ? 'mb-5' : 'mb-3',
          )}
        >
          {icon}
        </div>
      )}
      <h3
        className={cn(
          'font-semibold text-foreground',
          size === 'default' ? 'text-base' : 'text-sm',
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'text-muted-foreground mt-1 max-w-sm',
            size === 'default' ? 'text-sm' : 'text-xs',
          )}
        >
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex items-center gap-2">
          {action && (
            <Button
              size="sm"
              variant={action.variant ?? 'default'}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              size="sm"
              variant={secondaryAction.variant ?? 'outline'}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
