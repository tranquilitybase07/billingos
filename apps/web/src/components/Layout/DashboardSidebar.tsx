'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
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
  Building2, 
  LogOut, 
  Plus, 
  ChevronDown, 
} from 'lucide-react'
import { 
  Home01Icon,
  CubeIcon,
  StarIcon,
  CreditCardIcon, 
  Ticket01Icon,
  Target01Icon,
  ChartBarLineIcon,
  ReloadIcon,
  Settings01Icon,
  User03Icon
} from 'hugeicons-react'

import { useOrganization } from '@/providers/OrganizationProvider'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

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
  const { state } = useSidebar()
  const router = useRouter()
  const pathname = usePathname()
  const isCollapsed = state === 'collapsed'

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const menuGroups: MenuItemGroup[] = [
    {
      label: null, // Main group (no label)
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
          href: `/dashboard/${organization.slug}/analytics`, // Placeholder
        },
      ],
    },
    {
      label: 'RETENTION',
      items: [
        {
          title: 'Churn Prevention',
          icon: ReloadIcon,
          href: `/dashboard/${organization.slug}/churn`, // Placeholder
        },
      ],
    },
    {
      label: 'SYSTEM',
      items: [
        {
          title: 'Settings',
          icon: Settings01Icon,
          href: `/dashboard/${organization.slug}/settings`,
        },
      ],
    },
  ]



  // Determine the single active item based on the longest matching href
  // This prevents parent routes (like /products) from being active when on a child route (like /products/discounts)
  const allItems = menuGroups.flatMap(group => group.items)
  const activeItem = allItems
    .filter(item => {
      // Handle exact matches first (for Home)
      if (item.exact) return pathname === item.href
      // Handle prefix matches
      return pathname.startsWith(item.href)
    })
    .sort((a, b) => b.href.length - a.href.length)[0]

  return (
    <Sidebar variant="inset" collapsible="icon" className="text-muted-foreground">
      {/* Header with Logo */}
      <SidebarHeader className="border-b border-sidebar-border transition-[padding] duration-200 p-4 group-data-[collapsible=icon]:p-2 flex flex-row items-center justify-between">
        <div className={cn(
          "flex items-center gap-2 overflow-hidden transition-[max-width,opacity] duration-200 ease-linear",
          "max-w-48 opacity-100",
          "group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0"
        )}>
          <Link href={`/dashboard/${organization.slug}`} className="flex items-center gap-2">
            <div className="bg-sidebar-primary text-sidebar-primary-foreground h-8 w-8 rounded-lg flex items-center justify-center font-bold text-lg shrink-0">
              B
            </div>
            <span className="font-semibold text-sidebar-foreground whitespace-nowrap">BillingOS</span>
          </Link>
        </div>
        <SidebarTrigger className="text-muted-foreground hover:text-sidebar-foreground shrink-0" />
      </SidebarHeader>

      {/* Navigation Content */}
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
                          {/* Active Indicator Border */}
                          {/* {isItemActive && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-sidebar-primary" />
                          )} */}
                          
                          <item.icon 
                            className={cn(
                              "h-5 w-5 shrink-0 transition-colors", 
                              isItemActive ? "text-sidebar-primary" : "text-muted-foreground group-hover/item:text-sidebar-foreground"
                            )} 
                            strokeWidth={1.5}
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

      {/* Footer with Organization Switcher */}
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full outline-none group text-left">
              <div className="bg-sidebar-primary text-sidebar-primary-foreground h-8 w-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0">
                {organization.name.charAt(0).toUpperCase()}
              </div>
              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sidebar-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                      {organization.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {organization.slug}
                    </div>
                  </div>
                  <ChevronDown className="ml-auto h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-[#1A1A1A] border-white/10 text-gray-300" align="start" side="top">
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => router.push(`/dashboard/${org.slug}`)}
                className={cn(
                  "focus:bg-white/10 focus:text-white cursor-pointer",
                  org.id === organization.id && "bg-white/5 text-sidebar-primary"
                )}
              >
                <Building2 className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span className="font-medium">{org.name}</span>
                  <span className="text-muted-foreground text-xs">{org.slug}</span>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem className="focus:bg-white/10 focus:text-white cursor-pointer">
              <Plus className="mr-2 h-4 w-4" />
              <span>Create Organization</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              onClick={handleLogout}
              className="focus:bg-white/10 focus:text-destructive cursor-pointer text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
