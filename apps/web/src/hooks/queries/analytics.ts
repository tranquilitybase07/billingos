"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type {
  MRRResponse,
  RevenueTrendResponse,
  SubscriptionGrowthResponse,
  ChurnRateResponse,
  AnalyticsQueryParams,
  UsageOverviewResponse,
  UsageByFeatureResponse,
  AtRiskCustomersResponse,
  UsageTrendsResponse,
  ConversionFunnelResponse,
  DashboardOverviewResponse,
  ActivityFeedResponse,
  TopCustomersResponse,
  ProductSubscribersResponse,
} from "@/lib/api/types";

export const analyticsKeys = {
  all: ["analytics"] as const,
  mrr: (orgId: string) => [...analyticsKeys.all, "mrr", orgId] as const,
  dashboardOverview: (orgId: string) =>
    [...analyticsKeys.all, "dashboard-overview", orgId] as const,
  activityFeed: (orgId: string, limit: number) =>
    [...analyticsKeys.all, "activity-feed", orgId, limit] as const,
  topCustomers: (orgId: string) =>
    [...analyticsKeys.all, "top-customers", orgId] as const,
  productSubscribers: (orgId: string) =>
    [...analyticsKeys.all, "product-subscribers", orgId] as const,
  revenueTrend: (params: AnalyticsQueryParams) =>
    [...analyticsKeys.all, "revenue-trend", params] as const,
  subscriptionGrowth: (params: AnalyticsQueryParams) =>
    [...analyticsKeys.all, "subscription-growth", params] as const,
  churnRate: (params: AnalyticsQueryParams) =>
    [...analyticsKeys.all, "churn-rate", params] as const,
  usageOverview: (orgId: string) =>
    [...analyticsKeys.all, "usage-overview", orgId] as const,
  usageByFeature: (orgId: string) =>
    [...analyticsKeys.all, "usage-by-feature", orgId] as const,
  atRiskCustomers: (orgId: string, threshold: number) =>
    [...analyticsKeys.all, "at-risk", orgId, threshold] as const,
  usageTrends: (orgId: string, featureName: string, period: number) =>
    [...analyticsKeys.all, "usage-trends", orgId, featureName, period] as const,
};

export function useMRR(organizationId: string) {
  return useQuery({
    queryKey: analyticsKeys.mrr(organizationId),
    queryFn: () =>
      api.get<MRRResponse>(`/analytics/mrr?organization_id=${organizationId}`),
    enabled: !!organizationId,
  });
}

export function useRevenueTrend(params: AnalyticsQueryParams) {
  const { organization_id, start_date, end_date, granularity } = params;

  let url = `/analytics/revenue/trend?organization_id=${organization_id}`;
  if (start_date) url += `&start_date=${start_date}`;
  if (end_date) url += `&end_date=${end_date}`;
  if (granularity) url += `&granularity=${granularity}`;

  return useQuery({
    queryKey: analyticsKeys.revenueTrend(params),
    queryFn: () => api.get<RevenueTrendResponse>(url),
    enabled: !!organization_id,
    staleTime: 15 * 60 * 1000, // matches backend Redis TTL
  });
}

export function useSubscriptionGrowth(params: AnalyticsQueryParams) {
  const { organization_id, start_date, end_date, granularity } = params;

  let url = `/analytics/subscriptions/growth?organization_id=${organization_id}`;
  if (start_date) url += `&start_date=${start_date}`;
  if (end_date) url += `&end_date=${end_date}`;
  if (granularity) url += `&granularity=${granularity}`;

  return useQuery({
    queryKey: analyticsKeys.subscriptionGrowth(params),
    queryFn: () => api.get<SubscriptionGrowthResponse>(url),
    enabled: !!organization_id,
    staleTime: 15 * 60 * 1000, // matches backend Redis TTL
  });
}

export function useChurnRate(params: AnalyticsQueryParams) {
  const { organization_id, start_date, end_date, granularity } = params;

  let url = `/analytics/churn-rate?organization_id=${organization_id}`;
  if (start_date) url += `&start_date=${start_date}`;
  if (end_date) url += `&end_date=${end_date}`;
  if (granularity) url += `&granularity=${granularity}`;

  return useQuery({
    queryKey: analyticsKeys.churnRate(params),
    queryFn: () => api.get<ChurnRateResponse>(url),
    enabled: !!organization_id,
    staleTime: 15 * 60 * 1000, // matches backend Redis TTL
  });
}

export function useUsageOverview(organizationId: string) {
  return useQuery({
    queryKey: analyticsKeys.usageOverview(organizationId),
    queryFn: () =>
      api.get<UsageOverviewResponse>(
        `/analytics/usage/overview?organization_id=${organizationId}`,
      ),
    enabled: !!organizationId,
  });
}

export function useUsageByFeature(organizationId: string) {
  return useQuery({
    queryKey: analyticsKeys.usageByFeature(organizationId),
    queryFn: () =>
      api.get<UsageByFeatureResponse>(
        `/analytics/usage/by-feature?organization_id=${organizationId}`,
      ),
    enabled: !!organizationId,
  });
}

export function useAtRiskCustomers(
  organizationId: string,
  threshold: number = 80,
) {
  return useQuery({
    queryKey: analyticsKeys.atRiskCustomers(organizationId, threshold),
    queryFn: () =>
      api.get<AtRiskCustomersResponse>(
        `/analytics/usage/at-risk?organization_id=${organizationId}&threshold=${threshold}`,
      ),
    enabled: !!organizationId,
  });
}

export function useUsageTrends(
  organizationId: string,
  featureName: string,
  period: number = 30,
) {
  return useQuery({
    queryKey: analyticsKeys.usageTrends(organizationId, featureName, period),
    queryFn: () =>
      api.get<UsageTrendsResponse>(
        `/analytics/usage/trends?organization_id=${organizationId}&feature_name=${featureName}&period=${period}`,
      ),
    enabled: !!organizationId && !!featureName,
  });
}

export function useConversionFunnel(organizationId: string) {
  return useQuery({
    queryKey: [
      ...analyticsKeys.all,
      "conversion-funnel",
      organizationId,
    ] as const,
    queryFn: () =>
      api.get<ConversionFunnelResponse>(
        `/analytics/conversion-funnel?organization_id=${organizationId}`,
      ),
    enabled: !!organizationId,
  });
}

export function useDashboardOverview(organizationId: string) {
  return useQuery({
    queryKey: analyticsKeys.dashboardOverview(organizationId),
    queryFn: () =>
      api.get<DashboardOverviewResponse>(
        `/analytics/dashboard-overview?organization_id=${organizationId}`,
      ),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useActivityFeed(organizationId: string, limit: number = 10) {
  return useQuery({
    queryKey: analyticsKeys.activityFeed(organizationId, limit),
    queryFn: () =>
      api.get<ActivityFeedResponse>(
        `/analytics/activity-feed?organization_id=${organizationId}&limit=${limit}`,
      ),
    enabled: !!organizationId,
    refetchInterval: 2 * 60 * 1000,
  });
}

export function useTopCustomers(organizationId: string, limit: number = 5) {
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date("2020-01-01").toISOString().split("T")[0];

  return useQuery({
    queryKey: analyticsKeys.topCustomers(organizationId),
    queryFn: () =>
      api.get<TopCustomersResponse>(
        `/analytics/customers/top-revenue?organization_id=${organizationId}&start_date=${startDate}&end_date=${endDate}&limit=${limit}`,
      ),
    enabled: !!organizationId,
  });
}

export function useProductSubscribers(organizationId: string) {
  return useQuery({
    queryKey: analyticsKeys.productSubscribers(organizationId),
    queryFn: () =>
      api.get<ProductSubscribersResponse>(
        `/analytics/products/subscribers?organization_id=${organizationId}`,
      ),
    enabled: !!organizationId,
  });
}
