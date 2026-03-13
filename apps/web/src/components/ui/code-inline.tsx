import { cn } from '@/lib/utils'

interface CodeInlineProps {
  children: React.ReactNode
  className?: string
}

/**
 * Monospace inline code treatment for technical values like IDs, slugs, API keys.
 * Use this for any developer-facing identifiers that should look "technical".
 */
export function CodeInline({ children, className }: CodeInlineProps) {
  return (
    <span
      className={cn(
        'font-mono text-xs bg-muted border border-border/50 px-1.5 py-0.5 rounded',
        'text-foreground/80',
        className,
      )}
    >
      {children}
    </span>
  )
}
