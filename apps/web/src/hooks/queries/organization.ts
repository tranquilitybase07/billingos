"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { revalidateUserOrganizations } from "@/lib/actions/organizations";
import type {
  Organization,
  CreateOrganizationDTO,
  UpdateOrganizationDTO,
  SubmitBusinessDetailsDTO,
  PaymentStatus,
  OrganizationMember,
  InviteMemberDTO,
  OnboardingStatusResponse,
} from "@/lib/api/types";

// Query Keys
export const organizationKeys = {
  all: ["organizations"] as const,
  lists: () => [...organizationKeys.all, "list"] as const,
  list: () => [...organizationKeys.lists()] as const,
  details: () => [...organizationKeys.all, "detail"] as const,
  detail: (id: string) => [...organizationKeys.details(), id] as const,
  paymentStatus: (id: string) =>
    [...organizationKeys.detail(id), "payment-status"] as const,
  members: (id: string) => [...organizationKeys.detail(id), "members"] as const,
  onboardingStatus: (id: string, env: string) =>
    [...organizationKeys.detail(id), "onboarding-status", env] as const,
};

// List Organizations
export function useListOrganizations() {
  return useQuery({
    queryKey: organizationKeys.list(),
    queryFn: () => api.get<Organization[]>("/organizations"),
  });
}

// Get Single Organization
export function useOrganization(id: string) {
  return useQuery({
    queryKey: organizationKeys.detail(id),
    queryFn: () => api.get<Organization>(`/organizations/${id}`),
    enabled: !!id,
  });
}

// Create Organization
export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOrganizationDTO) =>
      api.post<Organization>("/organizations", data),
    onSuccess: async (organization) => {
      // Best-effort server cache revalidation — a failure here must not block
      // the client-side cache invalidation below, or the new org won't appear
      // in the switcher.
      await revalidateUserOrganizations().catch(() => {});

      // Invalidate organization list queries
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });

      // Invalidate specific organization queries
      queryClient.invalidateQueries({
        queryKey: organizationKeys.detail(organization.id),
      });

      queryClient.refetchQueries({
        queryKey: organizationKeys.lists(),
        type: "active",
      });
    },
  });
}

// Update Organization
export function useUpdateOrganization(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOrganizationDTO) =>
      api.patch<Organization>(`/organizations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    },
  });
}

// Delete Organization
export function useDeleteOrganization(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete(`/organizations/${id}`),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: organizationKeys.detail(id) });
      await queryClient.invalidateQueries({
        queryKey: organizationKeys.lists(),
      });
    },
  });
}

// Submit Business Details
export function useSubmitBusinessDetails(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SubmitBusinessDetailsDTO) =>
      api.post<Organization>(`/organizations/${id}/business-details`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.detail(id) });
      queryClient.invalidateQueries({
        queryKey: organizationKeys.paymentStatus(id),
      });
    },
  });
}

// Get Payment Status
export function usePaymentStatus(id: string) {
  return useQuery({
    queryKey: organizationKeys.paymentStatus(id),
    queryFn: () =>
      api.get<PaymentStatus>(`/organizations/${id}/payment-status`),
    enabled: !!id,
  });
}

// List Members
export function useListMembers(organizationId: string) {
  return useQuery({
    queryKey: organizationKeys.members(organizationId),
    queryFn: () =>
      api.get<OrganizationMember[]>(`/organizations/${organizationId}/members`),
    enabled: !!organizationId,
  });
}

// Invite Member
export function useInviteMember(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InviteMemberDTO) =>
      api.post<OrganizationMember>(
        `/organizations/${organizationId}/members/invite`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.members(organizationId),
      });
    },
  });
}

// Remove Member
export function useRemoveMember(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/organizations/${organizationId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.members(organizationId),
      });
    },
  });
}

// Get Onboarding Status
export function useOnboardingStatus(
  organizationId: string,
  environment: "sandbox" | "production" = "sandbox",
) {
  return useQuery({
    queryKey: organizationKeys.onboardingStatus(organizationId, environment),
    queryFn: () =>
      api.get<OnboardingStatusResponse>(
        `/organizations/${organizationId}/onboarding-status?environment=${environment}`,
      ),
    enabled: !!organizationId,
  });
}

// Update Organization Currency
export function useUpdateOrgCurrency(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (currency: string) =>
      api.patch<{ default_currency: string }>(
        `/organizations/${organizationId}/currency`,
        { currency },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.detail(organizationId),
      });
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    },
  });
}

// Leave Organization
export function useLeaveOrganization(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.delete(`/organizations/${organizationId}/members/leave`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
      queryClient.removeQueries({
        queryKey: organizationKeys.detail(organizationId),
      });
    },
  });
}
