'use client'

import { usePathname } from 'next/navigation'
import {
  Home,
  AttachMoney,
  Settings,
  People,
  Inventory as HiveOutlined,
  Link as LinkOutlined,
  Discount as DiscountOutlined,
  Diamond as DiamondOutlined,
  DonutLarge as DonutLargeOutlined
} from '@mui/icons-material'
import type { Organization } from '@/lib/api/types'

export type SubRoute = {
  readonly title: string
  readonly link: string
  readonly icon?: React.ReactNode
  readonly if?: boolean | (() => boolean)
}

export type Route = {
  readonly id: string
  readonly title: string
  readonly icon?: React.ReactElement<any>
  readonly link: string
  readonly if: boolean | undefined
  readonly subs?: SubRoute[]
  readonly selectedExactMatchOnly?: boolean
  readonly checkIsActive?: (currentPath: string) => boolean
}

export type RouteWithActive = Route & {
  isActive: boolean
  subs?: (SubRoute & { isActive: boolean })[]
}

/**
 * General routes - Available to all organizations
 */
const generalRoutesList = (org?: Organization): Route[] => [
  {
    id: 'home',
    title: 'Home',
    icon: <Home fontSize="inherit" />,
    link: `/dashboard/${org?.slug}`,
    checkIsActive: (currentRoute: string) =>
      currentRoute === `/dashboard/${org?.slug}`,
    if: true,
  },
  {
    id: 'products',
    title: 'Products',
    icon: <HiveOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/products`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/products`)
    },
    if: true,
    subs: [
      {
        title: 'Catalogue',
        link: `/dashboard/${org?.slug}/products`,
        icon: <HiveOutlined fontSize="inherit" />,
      },
      {
        title: 'Checkout Links',
        link: `/dashboard/${org?.slug}/products/checkout-links`,
        icon: <LinkOutlined fontSize="inherit" />,
      },
      {
        title: 'Discounts',
        link: `/dashboard/${org?.slug}/products/discounts`,
        icon: <DiscountOutlined fontSize="inherit" />,
      },
      {
        title: 'Benefits',
        link: `/dashboard/${org?.slug}/products/benefits`,
        icon: <DiamondOutlined fontSize="inherit" />,
      },
      {
        title: 'Meters',
        link: `/dashboard/${org?.slug}/products/meters`,
        icon: <DonutLargeOutlined fontSize="inherit" />,
      },
    ],
  },
]

/**
 * Organization-specific routes - Finance, Settings, etc.
 */
const organizationRoutesList = (org?: Organization): Route[] => [
  {
    id: 'finance',
    title: 'Finance',
    link: `/dashboard/${org?.slug}/finance`,
    icon: <AttachMoney fontSize="inherit" />,
    if: true,
    subs: [
      {
        title: 'Account',
        link: `/dashboard/${org?.slug}/finance/account`,
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    link: `/dashboard/${org?.slug}/settings`,
    icon: <Settings fontSize="inherit" />,
    if: true,
    subs: [
      {
        title: 'General',
        link: `/dashboard/${org?.slug}/settings`,
      },
      {
        title: 'Members',
        link: `/dashboard/${org?.slug}/settings/members`,
      },
    ],
  },
]

/**
 * Apply active state to a route based on current pathname
 */
const applyIsActive =
  (path: string): ((r: Route) => RouteWithActive) =>
  (r: Route): RouteWithActive => {
    let isActive = false

    if (r.checkIsActive !== undefined) {
      isActive = r.checkIsActive(path)
    } else {
      isActive = Boolean(path && path.startsWith(r.link))
    }

    const subs = r.subs ? r.subs.map(applySubRouteIsActive(path, r)) : undefined

    return { ...r, isActive, subs }
  }

/**
 * Apply active state to sub-routes
 */
const applySubRouteIsActive =
  (path: string, parentRoute: Route) =>
  (sr: SubRoute): SubRoute & { isActive: boolean } => {
    const isActive = Boolean(path && path.startsWith(sr.link))
    return { ...sr, isActive }
  }

/**
 * Resolve routes with active state and filtering
 */
const useResolveRoutes = (
  getRoutes: (org?: Organization) => Route[],
  org?: Organization,
  allowAll?: boolean,
): RouteWithActive[] => {
  const path = usePathname()

  return getRoutes(org)
    .filter((o) => allowAll || o.if)
    .map(applyIsActive(path))
}

/**
 * Hook to get general routes with active state
 */
export const useGeneralRoutes = (
  org?: Organization,
  allowAll?: boolean,
): RouteWithActive[] => {
  return useResolveRoutes(generalRoutesList, org, allowAll)
}

/**
 * Hook to get organization routes with active state
 */
export const useOrganizationRoutes = (
  org?: Organization,
  allowAll?: boolean,
): RouteWithActive[] => {
  return useResolveRoutes(organizationRoutesList, org, allowAll)
}
