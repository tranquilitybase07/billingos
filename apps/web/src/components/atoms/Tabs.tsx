import {
  TabsContent as TabsContentPrimitive,
  TabsList as TabsListPrimitive,
  Tabs as TabsPrimitive,
  TabsTrigger as TabsTriggerPrimitive,
} from '@/components/ui/tabs'
import React from 'react'
import { twMerge } from 'tailwind-merge'

const Tabs = TabsPrimitive

const TabsList = ({
  ref,
  className,
  vertical,
  ...props
}: React.ComponentProps<typeof TabsListPrimitive> & { vertical?: boolean }) => (
  <TabsListPrimitive
    ref={ref}
    className={twMerge(
      'relative flex h-fit w-fit flex-row items-start gap-2 rounded-2xl bg-transparent ring-0 md:flex-row dark:bg-transparent dark:ring-0',
      vertical
        ? 'flex-col md:flex-col'
        : 'md:flex-row md:items-center md:justify-start',
      className,
    )}
    {...props}
  />
)
TabsList.displayName = TabsListPrimitive.displayName

const TabsTrigger = ({
  ref,
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof TabsTriggerPrimitive> & {
  size?: 'default' | 'small'
}) => (
  <TabsTriggerPrimitive
    ref={ref}
    className={twMerge(
      'data-[state=active]:bg-muted data-[state=active]:text-foreground hover:text-foreground text-muted-foreground cursor-pointer px-4 data-[state=active]:rounded-xl data-[state=active]:shadow-none',
      size === 'default' ? 'text-sm' : 'text-xs',
      className,
    )}
    {...props}
  />
)
TabsTrigger.displayName = TabsTriggerPrimitive.displayName

const TabsContent = ({
  ref,
  className,
  ...props
}: React.ComponentProps<typeof TabsContentPrimitive>) => (
  <TabsContentPrimitive ref={ref} className={twMerge(className)} {...props} />
)
TabsContent.displayName = TabsContentPrimitive.displayName

export { Tabs, TabsContent, TabsList, TabsTrigger }
