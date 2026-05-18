import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { SettingsTabNav } from './_components/SettingsTabNav'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardBody className="gap-6">
      <SettingsTabNav />
      {children}
    </DashboardBody>
  )
}
