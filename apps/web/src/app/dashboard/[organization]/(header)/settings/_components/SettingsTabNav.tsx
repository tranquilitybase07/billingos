'use client'

import { useParams, usePathname, useRouter } from 'next/navigation'
import {
  Settings01Icon,
  UserMultiple02Icon,
  CreditCardIcon,
  Key01Icon,
} from 'hugeicons-react'
import { PillTabs, PillTabsList, PillTabsTrigger } from '@/components/atoms/PillTabs'
import { useEnvironment } from '@/providers/EnvironmentProvider'

type SettingsTab = 'general' | 'members' | 'billing' | 'api-keys'

const TABS: { id: SettingsTab; label: string; icon: React.ElementType; path: string }[] = [
  { id: 'general', label: 'General', icon: Settings01Icon, path: '' },
  { id: 'members', label: 'Members', icon: UserMultiple02Icon, path: '/members' },
  { id: 'billing', label: 'Billing', icon: CreditCardIcon, path: '/billing' },
  { id: 'api-keys', label: 'API Keys', icon: Key01Icon, path: '/api-keys' },
]

function activeTabFromPath(pathname: string, base: string): SettingsTab {
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) : ''
  if (rel.startsWith('/members')) return 'members'
  if (rel.startsWith('/billing')) return 'billing'
  if (rel.startsWith('/api-keys')) return 'api-keys'
  return 'general'
}

export function SettingsTabNav() {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const { environment } = useEnvironment()
  const base = `/dashboard/${params.organization}/settings`
  const active = activeTabFromPath(pathname, base)

  // Sandbox orgs get an auto-created, pre-connected Stripe Express account, so
  // there's nothing to manage on the billing tab — hide it in sandbox mode.
  const tabs = TABS.filter(
    (tab) => !(tab.id === 'billing' && environment === 'sandbox'),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your organization settings
        </p>
      </div>

      <PillTabs
        layoutId="settings-tab-indicator"
        value={active}
        onValueChange={(value) => {
          const tab = TABS.find((t) => t.id === value)
          if (tab) router.push(`${base}${tab.path}`)
        }}
      >
        <PillTabsList>
          {tabs.map((tab) => (
            <PillTabsTrigger key={tab.id} value={tab.id}>
              <tab.icon size={14} className="shrink-0" />
              {tab.label}
            </PillTabsTrigger>
          ))}
        </PillTabsList>
      </PillTabs>
    </div>
  )
}
