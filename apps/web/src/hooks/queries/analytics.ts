'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { 
  MRRResponse, 
  MRRTrendResponse,
  RevenueTrendResponse, 
  SubscriptionGrowthResponse,
  ChurnRateResponse,
  AnalyticsQueryParams 
} from '@/lib/api/types'

export const analyticsKeys = {
  all: ['analytics'] as const,
  mrr: (orgId: string) => [...analyticsKeys.all, 'mrr', orgId] as const,
  mrrTrend: (params: AnalyticsQueryParams) => [...analyticsKeys.all, 'mrr-trend', params] as const,
  revenueTrend: (params: AnalyticsQueryParams) => [...analyticsKeys.all, 'revenue-trend', params] as const,
  subscriptionGrowth: (params: AnalyticsQueryParams) => [...analyticsKeys.all, 'subscription-growth', params] as const,
  churnRate: (params: AnalyticsQueryParams) => [...analyticsKeys.all, 'churn-rate', params] as const,
}

export function useMRR(organizationId: string) {
  return useQuery({
    queryKey: analyticsKeys.mrr(organizationId),
    queryFn: () => api.get<MRRResponse>(`/analytics/mrr?organization_id=${organizationId}`),
    enabled: !!organizationId,
  })
}

export function useMRRTrend(params: AnalyticsQueryParams) {
  const { organization_id, start_date, end_date, granularity } = params
  
  let url = `/analytics/mrr/trend?organization_id=${organization_id}`
  if (start_date) url += `&start_date=${start_date}`
  if (end_date) url += `&end_date=${end_date}`
  if (granularity) url += `&granularity=${granularity}`

  return useQuery({
    queryKey: analyticsKeys.mrrTrend(params),
    queryFn: () => api.get<MRRTrendResponse>(url),
    enabled: !!organization_id,
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
