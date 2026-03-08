import { EnvironmentProvider } from '@/providers/EnvironmentProvider'
import { TestModeBanner } from '@/components/TestModeBanner'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <EnvironmentProvider>
      <TestModeBanner />
      {children}
    </EnvironmentProvider>
  )
}
