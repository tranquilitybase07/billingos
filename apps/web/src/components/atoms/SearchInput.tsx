'use client'

import * as React from 'react'
import { Search01Icon, Cancel01Icon } from 'hugeicons-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SearchInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value' | 'type'> {
  value: string
  onValueChange: (next: string) => void
  /** Width utility class for the wrapper, e.g. "w-64". */
  widthClassName?: string
}

export function SearchInput({
  value,
  onValueChange,
  placeholder = 'Search...',
  widthClassName = 'w-64',
  className,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn('relative group', widthClassName)}>
      <Search01Icon
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-foreground transition-colors pointer-events-none"
      />
      <Input
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-9 bg-muted/40 border-border rounded-lg pl-9 pr-8 text-sm',
          'focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0',
          className,
        )}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onValueChange('')}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <Cancel01Icon size={12} />
        </button>
      )}
    </div>
  )
}
