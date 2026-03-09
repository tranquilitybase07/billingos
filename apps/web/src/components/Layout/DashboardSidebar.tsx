'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Building02Icon,
  Logout01Icon,
  PlusSignIcon,
  ArrowDown01Icon,
} from 'hugeicons-react'
import {
  Home01Icon,
  CubeIcon,
  StarIcon,
  CreditCardIcon,
  Ticket01Icon,
  User03Icon,
  ChartBarLineIcon,
  ReloadIcon,
  Settings01Icon,
} from 'hugeicons-react'

import { useOrganization } from '@/providers/OrganizationProvider'
import { useEnvironment } from '@/providers/EnvironmentProvider'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { EnvironmentSwitcher } from '@/components/EnvironmentSwitcher'

interface MenuItem {
  title: string
  icon: React.ElementType
  href: string
  exact?: boolean
}

interface MenuItemGroup {
  label: string | null
  items: MenuItem[]
}

export const DashboardSidebar = () => {
  const { organization, organizations } = useOrganization()
  const { environment } = useEnvironment()
  const { state } = useSidebar()
  const router = useRouter()
  const pathname = usePathname()
  const isCollapsed = state === 'collapsed'
  const [logoError, setLogoError] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const menuGroups: MenuItemGroup[] = [
    {
      label: null,
      items: [
        {
          title: 'Home',
          icon: Home01Icon,
          href: `/dashboard/${organization.slug}`,
          exact: true,
        },
      ],
    },
    {
      label: 'BILLING',
      items: [
        {
          title: 'Product',
          icon: CubeIcon,
          href: `/dashboard/${organization.slug}/products`,
        },
        {
          title: 'Features',
          icon: StarIcon,
          href: `/dashboard/${organization.slug}/products/features`,
        },
        {
          title: 'Subscription',
          icon: CreditCardIcon,
          href: `/dashboard/${organization.slug}/sales/subscriptions`,
        },
        {
          title: 'Coupons',
          icon: Ticket01Icon,
          href: `/dashboard/${organization.slug}/products/discounts`,
        },
        {
          title: 'Customers',
          icon: User03Icon,
          href: `/dashboard/${organization.slug}/customers`,
        },
        {
          title: 'Analytics',
          icon: ChartBarLineIcon,
          href: `/dashboard/${organization.slug}/analytics`,
        },
      ],
    },
    {
      label: 'RETENTION',
      items: [
        {
          title: 'Churn Prevention',
          icon: ReloadIcon,
          href: `/dashboard/${organization.slug}/churn`,
        },
      ],
    },
  ]

  const settingsHref = `/dashboard/${organization.slug}/settings`

  // Determine active item (longest matching href wins)
  const allItems = [
    ...menuGroups.flatMap(group => group.items),
    { title: 'Settings', icon: Settings01Icon, href: settingsHref },
  ]
  const activeItem = allItems
    .filter(item => {
      if ('exact' in item && item.exact) return pathname === item.href
      return pathname.startsWith(item.href)
    })
    .sort((a, b) => b.href.length - a.href.length)[0]

  const isSettingsActive = activeItem?.href === settingsHref

  return (
    <Sidebar variant="inset" collapsible="icon" className="text-muted-foreground">
      {/* ── Header: Logo + Context Zone ── */}
      <SidebarHeader className="border-b border-sidebar-border p-0">
        {/* Logo row */}
        <div className="flex items-center px-4 pt-3 pb-1.5 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:pt-3 group-data-[collapsible=icon]:justify-center transition-[padding] duration-200">
          <Link href={`/dashboard/${organization.slug}`} className="flex items-center gap-2">
            {!logoError ? (
              <Image
                src="/Logo.png"
                alt="BillingOS Logo"
                width={26}
                height={26}
                className="w-auto object-contain shrink-0"
                onError={() => setLogoError(true)}
                priority
              />
            ) : (
              <div className="bg-sidebar-primary text-sidebar-primary-foreground h-6 w-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0">
                B
              </div>
            )}

          </Link>
        </div>

        {/* Org + Environment switcher (combined) */}
        <div className="px-3 pb-3 group-data-[collapsible=icon]:px-1.5 transition-[padding] duration-200">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 w-full outline-none group/org text-left rounded-md px-2 py-1.5 hover:bg-sidebar-accent transition-colors">
                {/* Org avatar with env dot overlay */}
                <div className="relative shrink-0">
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground h-7 w-7 rounded-md flex items-center justify-center font-bold text-xs">
                    {organization.name.charAt(0).toUpperCase()}
                  </div>
                  <div className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar",
                    environment === 'sandbox' ? "bg-orange-500" : "bg-green-500"
                  )} />
                </div>
                <div className={cn(
                  "flex-1 min-w-0 transition-[max-width,opacity] duration-200 ease-linear overflow-hidden",
                  "max-w-48 opacity-100",
                  "group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0"
                )}>
                  <div className="font-semibold text-sidebar-foreground text-sm whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
                    {organization.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground leading-tight">
                    <span className="truncate">{organization.slug}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className={cn(
                      "shrink-0",
                      environment === 'sandbox' ? "text-orange-500" : "text-green-500"
                    )}>
                      {environment === 'sandbox' ? 'Test' : 'Live'}
                    </span>
                  </div>
                </div>
                <ArrowDown01Icon size={14} className={cn(
                  "ml-auto opacity-50 group-hover/org:opacity-100 transition-all duration-200 shrink-0",
                  "group-data-[collapsible=icon]:hidden"
                )} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 bg-popover border-border text-popover-foreground" align="start" side="right">
              {/* Environment switcher inside dropdown */}
              <div className="px-2 py-2">
                <EnvironmentSwitcher />
              </div>
              <DropdownMenuSeparator className="bg-border" />
              {organizations.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => router.push(`/dashboard/${org.slug}`)}
                  className={cn(
                    "focus:bg-accent focus:text-accent-foreground cursor-pointer",
                    org.id === organization.id && "bg-accent/50 text-sidebar-primary"
                  )}
                >
                  <Building02Icon size={16} className="mr-2" />
                  <div className="flex flex-col">
                    <span className="font-medium">{org.name}</span>
                    <span className="text-muted-foreground text-xs">{org.slug}</span>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem className="focus:bg-accent focus:text-accent-foreground cursor-pointer">
                <PlusSignIcon size={16} className="mr-2" />
                <span>Create Organization</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="focus:bg-accent focus:text-destructive cursor-pointer text-destructive"
              >
                <Logout01Icon size={16} className="mr-2" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarHeader>

      {/* ── Navigation Content ── */}
      <SidebarContent className="px-3 py-6 scrollbar-none">
        <SidebarMenu className="gap-1">
          {menuGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="mb-6 last:mb-0">
              {group.label && !isCollapsed && (
                <div className="px-3 mb-2 text-xs font-semibold tracking-wider text-muted-foreground/80 uppercase">
                  {group.label}
                </div>
              )}

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isItemActive = activeItem?.href === item.href

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        tooltip={isCollapsed ? item.title : undefined}
                        className={cn(
                          "w-full h-10 px-3 transition-colors group/item relative overflow-hidden",
                          isItemActive && "text-sidebar-foreground bg-gradient-to-r from-sidebar-primary/20 to-transparent"
                        )}
                      >
                        <Link href={item.href} className="flex items-center gap-3">
                          <item.icon
                            size={20}
                            className={cn(
                              "shrink-0 transition-colors",
                              isItemActive ? "text-sidebar-primary" : "text-muted-foreground group-hover/item:text-sidebar-foreground"
                            )}
                          />
                          <span className={cn(
                            "font-medium transition-colors",
                            isItemActive ? "text-sidebar-foreground" : "text-muted-foreground group-hover/item:text-sidebar-foreground"
                          )}>
                            {item.title}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </div>
            </div>
          ))}
        </SidebarMenu>
      </SidebarContent>

      {/* ── Footer: Settings + Utilities ── */}
      <SidebarFooter className="border-t border-sidebar-border p-3">
        {/* Settings link */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip={isCollapsed ? 'Settings' : undefined}
              className={cn(
                "w-full h-10 px-3 transition-colors group/item relative overflow-hidden",
                isSettingsActive && "text-sidebar-foreground bg-gradient-to-r from-sidebar-primary/20 to-transparent"
              )}
            >
              <Link href={settingsHref} className="flex items-center gap-3">
                <Settings01Icon
                  size={20}
                  className={cn(
                    "shrink-0 transition-colors",
                    isSettingsActive ? "text-sidebar-primary" : "text-muted-foreground group-hover/item:text-sidebar-foreground"
                  )}
                />
                <span className={cn(
                  "font-medium transition-colors",
                  isSettingsActive ? "text-sidebar-foreground" : "text-muted-foreground group-hover/item:text-sidebar-foreground"
                )}>
                  Settings
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Utility row: Theme + Collapse */}
        <div className={cn(
          "flex items-center gap-1 pt-2",
          isCollapsed ? "flex-col" : "flex-row"
        )}>
          <ThemeSwitcher variant="dropdown" />
          <SidebarTrigger className="text-muted-foreground hover:text-sidebar-foreground shrink-0" />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
