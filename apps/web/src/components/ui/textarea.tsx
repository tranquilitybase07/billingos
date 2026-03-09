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
        'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-base text-foreground focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-transparent dark:border-[oklch(0.32_0.018_264)] dark:placeholder:text-[oklch(0.48_0.014_264)] dark:focus-visible:border-blue-500/50',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
}
Textarea.displayName = 'Textarea'

export { Textarea }
