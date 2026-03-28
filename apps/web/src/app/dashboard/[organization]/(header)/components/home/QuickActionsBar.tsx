'use client'

import Link from 'next/link'
import {
  PackageIcon,
  UserMultiple02Icon,
  ChartIncreaseIcon,
  Key01Icon,
} from 'hugeicons-react'
import { useOrganization } from '@/providers/OrganizationProvider'
import { orgPath } from '@/lib/navigation'
import { Button } from '@/components/ui/button'

const actions = [
  {
    label: 'Create Product',
    href: '/products',
    icon: PackageIcon,
  },
  {
    label: 'Add Customer',
    href: '/customers',
    icon: UserMultiple02Icon,
  },
  {
    label: 'View Analytics',
    href: '/analytics',
    icon: ChartIncreaseIcon,
  },
  {
    label: 'API Keys',
    href: '/settings/api-keys',
    icon: Key01Icon,
  },
]

export function QuickActionsBar() {
  const { organization } = useOrganization()

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {actions.map((action) => (
        <Link key={action.label} href={orgPath(organization.slug, action.href)}>
          <Button variant="outline" className="gap-2 whitespace-nowrap">
            <action.icon size={16} />
            {action.label}
          </Button>
        </Link>
      ))}
    </div>
  )
}
