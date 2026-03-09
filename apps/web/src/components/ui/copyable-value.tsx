'use client'

import { useState } from 'react'
import { Copy01Icon, Tick01Icon } from 'hugeicons-react'
import { cn } from '@/lib/utils'

interface CopyableValueProps {
  value: string
  /** Display text (defaults to value) */
  display?: string
  /** How many characters to show before truncating with *** */
  revealLength?: number
  className?: string
  size?: 'sm' | 'default'
}

/**
 * Displays a technical value (ID, API key, code) in monospace with a copy button.
 * Replaces the scattered clipboard logic across the codebase.
 */
export function CopyableValue({
  value,
  display,
  revealLength,
  className,
  size = 'default',
}: CopyableValueProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const displayText =
    display ??
    (revealLength != null
      ? `${value.slice(0, revealLength)}${'•'.repeat(8)}`
      : value)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border border-border/50 bg-muted font-mono text-foreground/80',
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1',
        className,
      )}
    >
      <span className="truncate max-w-[200px]">{displayText}</span>
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          'flex-shrink-0 rounded p-0.5 transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-accent',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        )}
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <Tick01Icon size={12} className="text-green-500" />
        ) : (
          <Copy01Icon size={12} />
        )}
      </button>
    </span>
  )
}
