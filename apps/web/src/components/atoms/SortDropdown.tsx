'use client'

import * as React from 'react'
import { ArrowUpDownIcon } from 'hugeicons-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface SortDropdownProps<T extends string> {
  /** Label shown before the value, e.g. "Sort". */
  label?: string
  value: T
  onChange: (next: T) => void
  options: readonly T[]
  align?: 'start' | 'center' | 'end'
  className?: string
}

export function SortDropdown<T extends string>({
  label = 'Sort',
  value,
  onChange,
  options,
  align = 'end',
  className,
}: SortDropdownProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground bg-muted/40 border border-border rounded-lg hover:bg-muted/60 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <ArrowUpDownIcon size={13} className="text-muted-foreground/60" />
        {label}: {value}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={6}
        className="w-48 rounded-lg p-1.5 shadow-xl"
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as T)}
        >
          {options.map((opt) => (
            <DropdownMenuRadioItem
              key={opt}
              value={opt}
              className="px-2.5 py-2 rounded-md text-muted-foreground hover:text-foreground"
            >
              {opt}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
