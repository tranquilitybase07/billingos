"use client";

import { usePathname } from 'next/navigation'
import {
  Home01Icon,
  Settings01Icon,
  User03Icon,
  CubeIcon,
  Link01Icon,
  DiscountTag01Icon,
  Diamond01Icon,
  PieChart01Icon,
  ShoppingBag01Icon,
  RepeatIcon,
  BarChartIcon,
} from 'hugeicons-react'
import type { Organization } from '@/lib/api/types'

export type SubRoute = {
  readonly title: string;
  readonly link: string;
  readonly icon?: React.ReactNode;
  readonly if?: boolean | (() => boolean);
};

export type Route = {
  readonly id: string;
  readonly title: string;
  readonly icon?: React.ReactElement<any>;
  readonly link: string;
  readonly if: boolean | undefined;
  readonly subs?: SubRoute[];
  readonly selectedExactMatchOnly?: boolean;
  readonly checkIsActive?: (currentPath: string) => boolean;
};

export type RouteWithActive = Route & {
  isActive: boolean;
  subs?: (SubRoute & { isActive: boolean })[];
};

/**
 * General routes - Available to all organizations
 */
const generalRoutesList = (org?: Organization): Route[] => [
  {
    id: "home",
    title: "Home",
    icon: <Home01Icon size={16} />,
    link: `/dashboard/${org?.slug}`,
    checkIsActive: (currentRoute: string) =>
      currentRoute === `/dashboard/${org?.slug}`,
    if: true,
  },
  {
    id: 'products',
    title: 'Products',
    icon: <CubeIcon size={16} />,
    link: `/dashboard/${org?.slug}/products`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/products`)
    },
    if: true,
    subs: [
      {
        title: 'Catalogue',
        link: `/dashboard/${org?.slug}/products`,
        icon: <CubeIcon size={16} />,
      },
      {
        title: 'Checkout Links',
        link: `/dashboard/${org?.slug}/products/checkout-links`,
        icon: <Link01Icon size={16} />,
      },
      {
        title: 'Coupons',
        link: `/dashboard/${org?.slug}/products/discounts`,
        icon: <DiscountTag01Icon size={16} />,
      },
      {
        title: 'Features',
        link: `/dashboard/${org?.slug}/products/features`,
        icon: <Diamond01Icon size={16} />,
      },
      {
        title: 'Meters',
        link: `/dashboard/${org?.slug}/products/meters`,
        icon: <PieChart01Icon size={16} />,
      },
    ],
  },
  {
    id: 'sales',
    title: 'Sales',
    icon: <ShoppingBag01Icon size={16} />,
    link: `/dashboard/${org?.slug}/sales`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/sales`)
    },
    if: true,
    subs: [
      {
        title: 'Subscriptions',
        link: `/dashboard/${org?.slug}/sales/subscriptions`,
        icon: <RepeatIcon size={16} />,
      },
      {
        title: 'Orders',
        link: `/dashboard/${org?.slug}/sales`,
        icon: <ShoppingBag01Icon size={16} />,
      },
    ],
  },
]

/**
 * Organization-specific routes - Finance, Settings, etc.
 */
const organizationRoutesList = (org?: Organization): Route[] => [
  {
    id: "customers",
    title: "Customers",
    link: `/dashboard/${org?.slug}/customers`,
    icon: <User03Icon size={16} />,
    if: true,
  },
  {
    id: "analytics",
    title: "Analytics",
    link: `/dashboard/${org?.slug}/analytics`,
    icon: <BarChartIcon size={16} />,
    if: true,
  },
  {
    id: "settings",
    title: "Settings",
    link: `/dashboard/${org?.slug}/settings`,
    icon: <Settings01Icon size={16} />,
    if: true,
    subs: [
      {
        title: "General",
        link: `/dashboard/${org?.slug}/settings`,
      },
      {
        title: "Members",
        link: `/dashboard/${org?.slug}/settings/members`,
      },
      {
        title: "Billing",
        link: `/dashboard/${org?.slug}/settings/billing`,
      },
      {
        title: "API Keys",
        link: `/dashboard/${org?.slug}/settings/api-keys`,
      },
    ],
  },
];

/**
 * Apply active state to a route based on current pathname
 */
const applyIsActive =
  (path: string): ((r: Route) => RouteWithActive) =>
    (r: Route): RouteWithActive => {
      let isActive = false;

      if (r.checkIsActive !== undefined) {
        isActive = r.checkIsActive(path);
      } else {
        isActive = Boolean(path && path.startsWith(r.link));
      }

      const subs = r.subs
        ? r.subs.map(applySubRouteIsActive(path, r))
        : undefined;

      return { ...r, isActive, subs };
    };

/**
 * Apply active state to sub-routes
 */
const applySubRouteIsActive =
  (path: string, _parentRoute: Route) =>
    (sr: SubRoute): SubRoute & { isActive: boolean } => {
      const isActive = Boolean(path && path.startsWith(sr.link));
      return { ...sr, isActive };
    };

/**
 * Resolve routes with active state and filtering
 */
const useResolveRoutes = (
  getRoutes: (org?: Organization) => Route[],
  org?: Organization,
  allowAll?: boolean
): RouteWithActive[] => {
  const path = usePathname();

  return getRoutes(org)
    .filter((o) => allowAll || o.if)
    .map(applyIsActive(path));
};

/**
 * Hook to get general routes with active state
 */
export const useGeneralRoutes = (
  org?: Organization,
  allowAll?: boolean
): RouteWithActive[] => {
  return useResolveRoutes(generalRoutesList, org, allowAll);
};

/**
 * Hook to get organization routes with active state
 */
export const useOrganizationRoutes = (
  org?: Organization,
  allowAll?: boolean
): RouteWithActive[] => {
  return useResolveRoutes(organizationRoutesList, org, allowAll);
};
