import * as React from 'react'

import { cn } from '@/lib/utils'

const Textarea = ({
  ref,
  className,
  ...props
}: React.ComponentProps<'textarea'>) => {
  return (
    <textarea
      className={cn(
        'flex min-h-20 w-full rounded-md border border-border/60 bg-transparent px-3 py-2 text-base text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-blue-500/60 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:border-white/[0.08] dark:placeholder:text-[oklch(0.48_0.014_264)] dark:focus-visible:border-blue-500/60',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
}
Textarea.displayName = 'Textarea'

export { Textarea }
