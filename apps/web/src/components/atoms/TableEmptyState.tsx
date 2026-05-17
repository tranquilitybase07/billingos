'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TableEmptyStateProps {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }
  /** Override vertical padding. Default py-20. */
  className?: string
}

export function TableEmptyState({
  title,
  description,
  action,
  className,
}: TableEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-20 px-4 text-center',
        className,
      )}
    >
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <Button
          variant="secondary"
          size="sm"
          onClick={action.onClick}
          className="mt-1"
        >
          {action.icon}
          {action.label}
        </Button>
      )}
    </div>
  )
}
