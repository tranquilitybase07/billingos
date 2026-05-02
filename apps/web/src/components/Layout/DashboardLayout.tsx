'use client'

import { type CSSProperties, PropsWithChildren, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { DashboardSidebar } from './DashboardSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { useEnvironment } from '@/providers/EnvironmentProvider'
import { CommandPalette } from '@/components/CommandPalette/CommandPalette'

const BANNER_HEIGHT = '36px'

/**
 * Main dashboard layout wrapper
 * Provides sidebar navigation and main content area
 */
export const DashboardLayout = ({ children }: PropsWithChildren) => {
  const { environment } = useEnvironment()
  const isSandbox = environment === 'sandbox'

  return (
    <SidebarProvider
      defaultOpen={true}
      style={{ '--banner-height': isSandbox ? BANNER_HEIGHT : '0px' } as CSSProperties}
    >
      <div className="flex min-h-screen w-full">
        {/* Desktop sidebar */}
        <DashboardSidebar />

        {/* Main content area — offset by banner height when in sandbox */}
        <SidebarInset className={cn('flex w-full flex-col overflow-y-auto', isSandbox && 'pt-9')}>
          {children}
        </SidebarInset>
      </div>
      {/* Global Cmd+K command palette */}
      <CommandPalette />
    </SidebarProvider>
  )
}

/**
 * Dashboard page body wrapper
 * Provides consistent page structure with optional header and context view
 */
export const DashboardBody = (props: {
  children: ReactNode
  className?: string
  wrapperClassName?: string
  title?: ReactNode
  contextView?: ReactNode
  contextViewClassName?: string
  header?: ReactNode
  wide?: boolean
}) => {
  const {
    children,
    className,
    contextView,
    contextViewClassName,
  } = props

  return (
    <div className="flex h-full w-full flex-row gap-4 p-4">
      {/* Main content */}
      <div className="relative flex min-w-0 flex-1 flex-col">
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

      {/* Optional context view (right sidebar) */}
      {contextView && (
        <motion.div
          className={cn(
            'hidden w-full flex-col rounded-lg border bg-card shadow-sm md:flex md:max-w-xs xl:max-w-sm',
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
