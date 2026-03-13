import { DashboardLayout } from '@/components/Layout/DashboardLayout'

interface HeaderLayoutProps {
  children: React.ReactNode
}

/**
 * Header Layout - Client Component Wrapper
 * Wraps pages with DashboardLayout (sidebar + main content area)
 */
export default function HeaderLayout({ children }: HeaderLayoutProps) {
  return <DashboardLayout>{children}</DashboardLayout>
}
