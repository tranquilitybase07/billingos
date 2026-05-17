'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'

const PillTabsContext = React.createContext<{
  activeValue: string
  layoutId: string
}>({ activeValue: '', layoutId: '' })

interface PillTabsProps
  extends Omit<React.ComponentProps<typeof TabsPrimitive.Root>, 'orientation'> {
  /** Unique id for the sliding indicator (one per Tabs instance on the page). */
  layoutId: string
}

const PillTabs = ({
  layoutId,
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: PillTabsProps) => {
  const [internal, setInternal] = React.useState<string>(
    value ?? defaultValue ?? '',
  )
  const activeValue = value ?? internal

  return (
    <PillTabsContext.Provider value={{ activeValue, layoutId }}>
      <TabsPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={(v) => {
          if (value === undefined) setInternal(v)
          onValueChange?.(v)
        }}
        {...props}
      >
        {children}
      </TabsPrimitive.Root>
    </PillTabsContext.Provider>
  )
}

const PillTabsList = ({
  ref,
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center bg-muted/60 p-1 rounded-lg border border-border',
      className,
    )}
    {...props}
  />
)
PillTabsList.displayName = 'PillTabsList'

interface PillTabsTriggerProps
  extends React.ComponentProps<typeof TabsPrimitive.Trigger> {
  count?: number
}

const PillTabsTrigger = ({
  ref,
  className,
  value,
  count,
  children,
  ...props
}: PillTabsTriggerProps) => {
  const { activeValue, layoutId } = React.useContext(PillTabsContext)
  const isActive = activeValue === value

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        'relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50',
        'data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    >
      {isActive && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded-md bg-background shadow-sm"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          aria-hidden
        />
      )}
      <span className="relative z-10 flex items-center gap-1.5">
        {children}
        {typeof count === 'number' && (
          <span
            className={cn(
              'text-[11px]',
              isActive ? 'text-muted-foreground' : 'text-muted-foreground/60',
            )}
          >
            {count}
          </span>
        )}
      </span>
    </TabsPrimitive.Trigger>
  )
}
PillTabsTrigger.displayName = 'PillTabsTrigger'

export { PillTabs, PillTabsList, PillTabsTrigger }
