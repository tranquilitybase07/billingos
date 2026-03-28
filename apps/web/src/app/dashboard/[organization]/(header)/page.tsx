'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { GreetingHeader } from './components/home/GreetingHeader'
import { OnboardingChecklist } from './components/home/OnboardingChecklist'
import { DashboardCharts } from './components/home/DashboardCharts'
import { ActivityFeed } from './components/home/ActivityFeed'
import { TopCustomersCard } from './components/home/TopCustomersCard'
import { PlanDistributionCard } from './components/home/PlanDistributionCard'

export default function DashboardHomePage() {
  return (
    <DashboardBody className="gap-8">
      <GreetingHeader />
      <OnboardingChecklist />
      <DashboardCharts />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ActivityFeed />
        <TopCustomersCard />
        <PlanDistributionCard />
      </div>
    </DashboardBody>
  )
}
