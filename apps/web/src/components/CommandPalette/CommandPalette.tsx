'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useOrganization } from '@/providers/OrganizationProvider'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Home01Icon,
  Package01Icon,
  UserMultiple02Icon,
  BarChartIcon,
  Settings01Icon,
  DiscountTag01Icon,
  Link01Icon,
  DiamondIcon,
  PlusSignIcon,
  Key01Icon,
} from 'hugeicons-react'

interface NavItem {
  label: string
  icon: React.ReactNode
  href: string
  group: string
  shortcut?: string
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { organization } = useOrganization()
  const slug = organization?.slug

  // Open on Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const navigate = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  if (!slug) return null

  const navItems: NavItem[] = [
    {
      label: 'Home',
      icon: <Home01Icon size={16} />,
      href: `/dashboard/${slug}`,
      group: 'Navigate',
    },
    {
      label: 'Products',
      icon: <Package01Icon size={16} />,
      href: `/dashboard/${slug}/products`,
      group: 'Navigate',
    },
    {
      label: 'Customers',
      icon: <UserMultiple02Icon size={16} />,
      href: `/dashboard/${slug}/customers`,
      group: 'Navigate',
    },
    {
      label: 'Analytics',
      icon: <BarChartIcon size={16} />,
      href: `/dashboard/${slug}/analytics`,
      group: 'Navigate',
    },
    {
      label: 'Discounts',
      icon: <DiscountTag01Icon size={16} />,
      href: `/dashboard/${slug}/products/discounts`,
      group: 'Navigate',
    },
    {
      label: 'Features',
      icon: <DiamondIcon size={16} />,
      href: `/dashboard/${slug}/products/features`,
      group: 'Navigate',
    },
    {
      label: 'Checkout Links',
      icon: <Link01Icon size={16} />,
      href: `/dashboard/${slug}/products/checkout-links`,
      group: 'Navigate',
    },
    {
      label: 'Settings',
      icon: <Settings01Icon size={16} />,
      href: `/dashboard/${slug}/settings`,
      group: 'Navigate',
    },
    {
      label: 'API Keys',
      icon: <Key01Icon size={16} />,
      href: `/dashboard/${slug}/settings/api-keys`,
      group: 'Navigate',
    },
  ]

  const actionItems: NavItem[] = [
    {
      label: 'New Product',
      icon: <PlusSignIcon size={16} />,
      href: `/dashboard/${slug}/products/new`,
      group: 'Actions',
    },
    {
      label: 'New API Key',
      icon: <Key01Icon size={16} />,
      href: `/dashboard/${slug}/settings/api-keys`,
      group: 'Actions',
    },
  ]

  const groupedNav = ['Navigate', 'Actions']

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Go to a page or search actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groupedNav.map((group, idx) => {
          const items = group === 'Navigate' ? navItems : actionItems
          return (
            <div key={group}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {items.map((item) => (
                  <CommandItem
                    key={item.href + item.label}
                    onSelect={() => navigate(item.href)}
                    className="flex items-center gap-2"
                  >
                    <span className="text-muted-foreground">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {item.shortcut}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}
