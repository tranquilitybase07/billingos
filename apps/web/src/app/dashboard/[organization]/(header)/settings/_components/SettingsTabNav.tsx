'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Settings01Icon,
  UserMultiple02Icon,
  CreditCardIcon,
  Key01Icon,
} from 'hugeicons-react'
import { cn } from '@/lib/utils'

type SettingsTab = 'general' | 'members' | 'billing' | 'api-keys'

interface SettingsTabNavProps {
  activeTab: SettingsTab
}

const TABS: { id: SettingsTab; label: string; icon: React.ElementType; path: string }[] = [
  { id: 'general',  label: 'General',  icon: Settings01Icon,     path: '' },
  { id: 'members',  label: 'Members',  icon: UserMultiple02Icon,  path: '/members' },
  { id: 'billing',  label: 'Billing',  icon: CreditCardIcon,      path: '/billing' },
  { id: 'api-keys', label: 'API Keys', icon: Key01Icon,           path: '/api-keys' },
]

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

      <div className="inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <Link
              key={tab.id}
              href={`${base}${tab.path}`}
              scroll={false}
              className={cn(
                'relative inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors',
                isActive ? 'text-foreground' : 'hover:text-foreground/80',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="settings-tab-indicator"
                  className="absolute inset-0 rounded-md bg-background shadow-sm"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
                />
              )}
              <tab.icon size={14} className="relative z-10 shrink-0" />
              <span className="relative z-10">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
