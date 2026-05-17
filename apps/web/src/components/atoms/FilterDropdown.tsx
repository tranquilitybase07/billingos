'use client'

import * as React from 'react'
import { ArrowDown01Icon } from 'hugeicons-react'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export interface FilterDropdownOption {
  value: string
  label: string
}

interface FilterDropdownProps {
  label: string
  options: FilterDropdownOption[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Text shown when there are zero options. */
  emptyLabel?: string
  align?: 'start' | 'center' | 'end'
  className?: string
}

export function FilterDropdown({
  label,
  options,
  selected,
  onChange,
  emptyLabel = 'No options',
  align = 'end',
  className,
}: FilterDropdownProps) {
  const isActive = selected.length > 0

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive
            ? 'bg-muted border-border text-foreground'
            : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/60',
          className,
        )}
      >
        {label}
        {isActive && (
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-muted-foreground/20 text-[10px] font-medium">
            {selected.length}
          </span>
        )}
        <ArrowDown01Icon size={14} className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={6}
        className="w-56 rounded-lg p-1.5 shadow-xl"
      >
        {options.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          options.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt.value}
              checked={selected.includes(opt.value)}
              onSelect={(e) => {
                e.preventDefault()
                toggle(opt.value)
              }}
              className="px-2.5 py-2 rounded-md text-muted-foreground hover:text-foreground"
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
