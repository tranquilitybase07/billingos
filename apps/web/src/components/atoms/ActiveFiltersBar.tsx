'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cancel01Icon } from 'hugeicons-react'

import { cn } from '@/lib/utils'

export interface ActiveFilter {
  /** Stable key for AnimatePresence reconciliation. */
  id: string
  label: string
  onRemove: () => void
}

interface ActiveFiltersBarProps {
  filters: ActiveFilter[]
  onClearAll: () => void
  className?: string
}

export function ActiveFiltersBar({
  filters,
  onClearAll,
  className,
}: ActiveFiltersBarProps) {
  return (
    <AnimatePresence>
      {filters.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className={cn('flex items-center gap-2 overflow-hidden', className)}
        >
          <div className="flex flex-wrap items-center gap-2 py-1">
            <AnimatePresence initial={false}>
              {filters.map((f) => (
                <FilterChip
                  key={f.id}
                  label={f.label}
                  onRemove={f.onRemove}
                />
              ))}
            </AnimatePresence>
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 transition-colors"
            >
              Clear all
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string
  onRemove: () => void
}) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      layout
      className="flex items-center gap-1.5 px-2.5 py-1 bg-muted border border-border rounded-md text-xs font-medium text-muted-foreground"
    >
      <span className="truncate max-w-[150px]">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        className="text-muted-foreground/60 hover:text-foreground transition-colors rounded-sm p-0.5"
      >
        <Cancel01Icon size={10} />
      </button>
    </motion.div>
  )
}
