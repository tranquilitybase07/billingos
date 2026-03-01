'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
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
} from '@/lib/api/types'

export const analyticsKeys = {
  all: ['analytics'] as const,
  mrr: (orgId: string) => [...analyticsKeys.all, 'mrr', orgId] as const,
  revenueTrend: (params: AnalyticsQueryParams) => [...analyticsKeys.all, 'revenue-trend', params] as const,
  subscriptionGrowth: (params: AnalyticsQueryParams) => [...analyticsKeys.all, 'subscription-growth', params] as const,
  churnRate: (params: AnalyticsQueryParams) => [...analyticsKeys.all, 'churn-rate', params] as const,
  usageOverview: (orgId: string) => [...analyticsKeys.all, 'usage-overview', orgId] as const,
  usageByFeature: (orgId: string) => [...analyticsKeys.all, 'usage-by-feature', orgId] as const,
  atRiskCustomers: (orgId: string, threshold: number) => [...analyticsKeys.all, 'at-risk', orgId, threshold] as const,
  usageTrends: (orgId: string, featureName: string, period: number) => [...analyticsKeys.all, 'usage-trends', orgId, featureName, period] as const,
}

export function useMRR(organizationId: string) {
  return useQuery({
    queryKey: analyticsKeys.mrr(organizationId),
    queryFn: () => api.get<MRRResponse>(`/analytics/mrr?organization_id=${organizationId}`),
    enabled: !!organizationId,
  })
}

export function useRevenueTrend(params: AnalyticsQueryParams) {
  const { organization_id, start_date, end_date, granularity } = params
  
  let url = `/analytics/revenue/trend?organization_id=${organization_id}`
  if (start_date) url += `&start_date=${start_date}`
  if (end_date) url += `&end_date=${end_date}`
  if (granularity) url += `&granularity=${granularity}`

  return useQuery({
    queryKey: analyticsKeys.revenueTrend(params),
    queryFn: () => api.get<RevenueTrendResponse>(url),
    enabled: !!organization_id,
  })
}

export function useSubscriptionGrowth(params: AnalyticsQueryParams) {
  const { organization_id, start_date, end_date, granularity } = params
  
  let url = `/analytics/subscriptions/growth?organization_id=${organization_id}`
  if (start_date) url += `&start_date=${start_date}`
  if (end_date) url += `&end_date=${end_date}`
  if (granularity) url += `&granularity=${granularity}`

  return useQuery({
    queryKey: analyticsKeys.subscriptionGrowth(params),
    queryFn: () => api.get<SubscriptionGrowthResponse>(url),
    enabled: !!organization_id,
  })
}

export function useChurnRate(params: AnalyticsQueryParams) {
  const { organization_id, start_date, end_date, granularity } = params

  let url = `/analytics/churn-rate?organization_id=${organization_id}`
  if (start_date) url += `&start_date=${start_date}`
  if (end_date) url += `&end_date=${end_date}`
  if (granularity) url += `&granularity=${granularity}`

  return useQuery({
    queryKey: analyticsKeys.churnRate(params),
    queryFn: () => api.get<ChurnRateResponse>(url),
    enabled: !!organization_id,
  })
}

export function useUsageOverview(organizationId: string) {
  return useQuery({
    queryKey: analyticsKeys.usageOverview(organizationId),
    queryFn: () => api.get<UsageOverviewResponse>(`/analytics/usage/overview?organization_id=${organizationId}`),
    enabled: !!organizationId,
  })
}

export function useUsageByFeature(organizationId: string) {
  return useQuery({
    queryKey: analyticsKeys.usageByFeature(organizationId),
    queryFn: () => api.get<UsageByFeatureResponse>(`/analytics/usage/by-feature?organization_id=${organizationId}`),
    enabled: !!organizationId,
  })
}

export function useAtRiskCustomers(organizationId: string, threshold: number = 80) {
  return useQuery({
    queryKey: analyticsKeys.atRiskCustomers(organizationId, threshold),
    queryFn: () => api.get<AtRiskCustomersResponse>(`/analytics/usage/at-risk?organization_id=${organizationId}&threshold=${threshold}`),
    enabled: !!organizationId,
  })
}

export function useUsageTrends(organizationId: string, featureName: string, period: number = 30) {
  return useQuery({
    queryKey: analyticsKeys.usageTrends(organizationId, featureName, period),
    queryFn: () => api.get<UsageTrendsResponse>(`/analytics/usage/trends?organization_id=${organizationId}&feature_name=${featureName}&period=${period}`),
    enabled: !!organizationId && !!featureName,
  })
}
