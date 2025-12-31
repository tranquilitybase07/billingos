'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type {
  Organization,
  CreateOrganizationDTO,
  UpdateOrganizationDTO,
  SubmitBusinessDetailsDTO,
  PaymentStatus,
  OrganizationMember,
  InviteMemberDTO,
} from '@/lib/api/types'

// Query Keys
export const organizationKeys = {
  all: ['organizations'] as const,
  lists: () => [...organizationKeys.all, 'list'] as const,
  list: () => [...organizationKeys.lists()] as const,
  details: () => [...organizationKeys.all, 'detail'] as const,
  detail: (id: string) => [...organizationKeys.details(), id] as const,
  paymentStatus: (id: string) => [...organizationKeys.detail(id), 'payment-status'] as const,
  members: (id: string) => [...organizationKeys.detail(id), 'members'] as const,
}

// List Organizations
export function useListOrganizations() {
  return useQuery({
    queryKey: organizationKeys.list(),
    queryFn: () => api.get<Organization[]>('/organizations'),
  })
}

// Get Single Organization
export function useOrganization(id: string) {
  return useQuery({
    queryKey: organizationKeys.detail(id),
    queryFn: () => api.get<Organization>(`/organizations/${id}`),
    enabled: !!id,
  })
}

// Create Organization
export function useCreateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateOrganizationDTO) =>
      api.post<Organization>('/organizations', data),
    onSuccess: (organization) => {
      // Invalidate organization list queries
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() })

      // Invalidate specific organization queries
      queryClient.invalidateQueries({
        queryKey: organizationKeys.detail(organization.id)
      })

      // Force refetch of organization list immediately (like Polar's expire: 0)
      queryClient.refetchQueries({
        queryKey: organizationKeys.lists(),
        type: 'active'
      })
    },
  })
}

// Update Organization
export function useUpdateOrganization(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateOrganizationDTO) =>
      api.patch<Organization>(`/organizations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() })
    },
  })
}

// Delete Organization
export function useDeleteOrganization(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.delete(`/organizations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() })
      queryClient.removeQueries({ queryKey: organizationKeys.detail(id) })
    },
  })
}

// Submit Business Details
export function useSubmitBusinessDetails(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SubmitBusinessDetailsDTO) =>
      api.post<Organization>(`/organizations/${id}/business-details`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: organizationKeys.paymentStatus(id) })
    },
  })
}

// Get Payment Status
export function usePaymentStatus(id: string) {
  return useQuery({
    queryKey: organizationKeys.paymentStatus(id),
    queryFn: () => api.get<PaymentStatus>(`/organizations/${id}/payment-status`),
    enabled: !!id,
  })
}

// List Members
export function useListMembers(organizationId: string) {
  return useQuery({
    queryKey: organizationKeys.members(organizationId),
    queryFn: () =>
      api.get<OrganizationMember[]>(`/organizations/${organizationId}/members`),
    enabled: !!organizationId,
  })
}

// Invite Member
export function useInviteMember(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: InviteMemberDTO) =>
      api.post<OrganizationMember>(
        `/organizations/${organizationId}/members/invite`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.members(organizationId),
      })
    },
  })
}

// Remove Member
export function useRemoveMember(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/organizations/${organizationId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.members(organizationId),
      })
    },
  })
}

// Leave Organization
export function useLeaveOrganization(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () =>
      api.delete(`/organizations/${organizationId}/members/leave`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() })
      queryClient.removeQueries({
        queryKey: organizationKeys.detail(organizationId),
      })
    },
  })
}
