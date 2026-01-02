'use client'

import { useOrganization } from '@/providers/OrganizationProvider'
import {
  useGeneralRoutes,
  useOrganizationRoutes,
  type RouteWithActive,
  type SubRoute,
} from '@/components/Dashboard/navigation'

/**
 * Hook to get the currently active route and sub-route
 * Used for displaying page titles and breadcrumbs
 */
export const useRoute = (): {
  currentRoute: RouteWithActive | undefined
  currentSubRoute: (SubRoute & { isActive: boolean }) | undefined
} => {
  const { organization } = useOrganization()
  const generalRoutes = useGeneralRoutes(organization)
  const organizationRoutes = useOrganizationRoutes(organization)

  const allRoutes = [...generalRoutes, ...organizationRoutes]

  const currentRoute = allRoutes.find((route) => route.isActive)
  const currentSubRoute = currentRoute?.subs?.find((sub) => (sub as SubRoute & { isActive: boolean }).isActive) as (SubRoute & { isActive: boolean }) | undefined

  return {
    currentRoute,
    currentSubRoute,
  }
}
