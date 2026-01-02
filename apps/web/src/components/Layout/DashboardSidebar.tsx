'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
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
import { ChevronDown, Plus, Building2 } from 'lucide-react'
import { Logo } from '@/components/branding/Logo'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useGeneralRoutes, useOrganizationRoutes } from '@/components/Dashboard/navigation'
import { cn } from '@/lib/utils'

export const DashboardSidebar = () => {
  const { organization, organizations } = useOrganization()
  const { state } = useSidebar()
  const router = useRouter()
  const isCollapsed = state === 'collapsed'

  const generalRoutes = useGeneralRoutes(organization)
  const organizationRoutes = useOrganizationRoutes(organization)
  const dashboardRoutes = [...generalRoutes, ...organizationRoutes]

  return (
    <Sidebar variant="inset" collapsible="icon">
      {/* Header with logo and collapse trigger */}
      <SidebarHeader className="border-sidebar-border flex flex-row items-center justify-between border-b px-4 py-3">
        <Link href={`/dashboard/${organization.slug}`} className="flex items-center gap-2">
          <Logo className="h-6 w-6" />
          {!isCollapsed && (
            <span className="text-sidebar-foreground font-semibold">BillingOS</span>
          )}
        </Link>
        {!isCollapsed && <SidebarTrigger />}
      </SidebarHeader>

      {/* Navigation content */}
      <SidebarContent className="px-2 py-4">
        <SidebarMenu>
          {dashboardRoutes.map((route) => (
            <SidebarMenuItem key={route.id}>
              <SidebarMenuButton
                asChild
                isActive={route.isActive}
                tooltip={isCollapsed ? route.title : undefined}
              >
                <Link href={route.link} className="flex items-center gap-3">
                  {route.icon && (
                    <span className="text-sidebar-foreground/70">
                      {route.icon}
                    </span>
                  )}
                  <span>{route.title}</span>
                </Link>
              </SidebarMenuButton>

              {/* Sub-navigation */}
              {route.isActive && route.subs && !isCollapsed && (
                <SidebarMenuSub>
                  {route.subs.map((subRoute) => {
                    const subRouteWithActive = subRoute as typeof subRoute & { isActive?: boolean }
                    return (
                      <SidebarMenuSubItem key={subRoute.link}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={subRouteWithActive.isActive}
                        >
                          <Link href={subRoute.link}>{subRoute.title}</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    )
                  })}
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer with organization switcher */}
      <SidebarFooter className="border-sidebar-border mt-auto border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground w-full"
                  tooltip={isCollapsed ? organization.name : undefined}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="bg-sidebar-primary text-sidebar-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold">
                      {organization.name.charAt(0).toUpperCase()}
                    </div>
                    {!isCollapsed && (
                      <div className="flex flex-1 flex-col items-start overflow-hidden text-left text-sm">
                        <span className="truncate font-medium">
                          {organization.name}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          {organization.slug}
                        </span>
                      </div>
                    )}
                  </div>
                  {!isCollapsed && (
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0" />
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align={isCollapsed ? 'end' : 'start'}
                className="w-56"
              >
                {organizations.map((org) => (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => router.push(`/dashboard/${org.slug}`)}
                    className={cn(
                      'flex items-center gap-2',
                      org.id === organization.id && 'bg-accent',
                    )}
                  >
                    <Building2 className="h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="font-medium">{org.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {org.slug}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => router.push('/dashboard/create')}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Organization</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
