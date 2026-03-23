'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Settings01Icon,
  UserMultiple02Icon,
  CreditCardIcon,
  Key01Icon,
} from 'hugeicons-react'

type SettingsTab = 'general' | 'members' | 'billing' | 'api-keys'

interface SettingsTabNavProps {
  activeTab: SettingsTab
}

export function SettingsTabNav({ activeTab }: SettingsTabNavProps) {
  const params = useParams()
  const base = `/dashboard/${params.organization}/settings`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your organization settings
        </p>
      </div>

      <Tabs value={activeTab} className="w-full">
        <TabsList>
          <TabsTrigger value="general" asChild>
            <Link href={base}>
              <Settings01Icon size={16} className="mr-2" />
              General
            </Link>
          </TabsTrigger>
          <TabsTrigger value="members" asChild>
            <Link href={`${base}/members`}>
              <UserMultiple02Icon size={16} className="mr-2" />
              Members
            </Link>
          </TabsTrigger>
          <TabsTrigger value="billing" asChild>
            <Link href={`${base}/billing`}>
              <CreditCardIcon size={16} className="mr-2" />
              Billing
            </Link>
          </TabsTrigger>
          <TabsTrigger value="api-keys" asChild>
            <Link href={`${base}/api-keys`}>
              <Key01Icon size={16} className="mr-2" />
              API Keys
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
