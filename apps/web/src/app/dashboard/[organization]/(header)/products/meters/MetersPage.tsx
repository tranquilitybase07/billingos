'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { DonutLarge as DonutLargeOutlined } from '@mui/icons-material'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface MetersPageProps {
  organizationSlug: string
}

export default function MetersPage({ organizationSlug }: MetersPageProps) {
  // TODO: Replace with actual data fetching when backend is ready
  const meters: any[] = []

  if (meters.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center pt-32">
        <div className="flex flex-col items-center justify-center gap-y-8">
          <DonutLargeOutlined className="text-5xl text-muted-foreground/30" />
          <div className="flex flex-col items-center justify-center gap-y-2">
            <h3 className="text-xl">No Meters</h3>
            <p className="text-muted-foreground">
              Create a meter to track usage-based billing
            </p>
          </div>
          <Link href={`/dashboard/${organizationSlug}/products/meters/create`}>
            <Button>Create Meter</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-8">
        <div className="flex justify-end">
          <Link href={`/dashboard/${organizationSlug}/products/meters/create`}>
            <Button>Create Meter</Button>
          </Link>
        </div>
        <div className="rounded-lg border bg-card">
          <div className="p-6">
            <p className="text-muted-foreground">Meters will appear here</p>
          </div>
        </div>
      </div>
    </DashboardBody>
  )
}
