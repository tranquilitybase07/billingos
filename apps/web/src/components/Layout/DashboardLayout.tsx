'use client'

import { PropsWithChildren, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { DashboardSidebar } from './DashboardSidebar'
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { useRoute } from '@/components/Navigation/useRoute'
import { cn } from '@/lib/utils'

/**
 * Main dashboard layout wrapper
 * Provides sidebar navigation and main content area
 */
export const DashboardLayout = ({ children }: PropsWithChildren) => {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        {/* Desktop sidebar */}
        <DashboardSidebar />

        {/* Main content area */}
        <SidebarInset className="flex w-full flex-col">
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

/**
 * Dashboard page body wrapper
 * Provides consistent page structure with optional header and context view
 */
export const DashboardBody = ({
  children,
  className,
  wrapperClassName,
  title,
  contextView,
  contextViewClassName,
  header,
  wide = false,
}: {
  children: ReactNode
  className?: string
  wrapperClassName?: string
  title?: string
  contextView?: ReactNode
  contextViewClassName?: string
  header?: ReactNode
  wide?: boolean
}) => {
  const { currentRoute, currentSubRoute } = useRoute()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  // Use current route title if no title provided
  const pageTitle = title ?? currentSubRoute?.title ?? currentRoute?.title

  return (
    <div className="flex h-full w-full flex-row gap-4 p-4 dark:bg-black">
      {/* Main content */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div
        // className={cn(
        //   'flex h-full w-full flex-col rounded-lg border bg-card dark:bg-black dark:border-polar-800 shadow-sm',
        //   wrapperClassName,
        //   !wide && 'mx-auto max-w-7xl',
        // )}
        >
          {/* Page header */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h1 className="text-2xl font-semibold tracking-tight">
              {pageTitle}
            </h1>
            {header}
          </div>

          {/* Page content */}
          <motion.div
            className={cn('flex w-full flex-col p-6', className)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </div>
      </div>

      {/* Optional context view (right sidebar) */}
      {contextView && (
        <motion.div
          className={cn(
            'hidden w-full flex-col rounded-lg border bg-card dark:bg-polar-900 dark:border-polar-800 shadow-sm md:flex md:max-w-xs xl:max-w-sm',
            contextViewClassName,
          )}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          {contextView}
        </motion.div>
      )}
    </div>
  )
}
