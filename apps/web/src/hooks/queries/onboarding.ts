"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { OnboardingState } from "@/lib/api/types";

export const onboardingKeys = {
  all: ["onboarding"] as const,
  state: () => [...onboardingKeys.all, "state"] as const,
};

export function useOnboardingState() {
  return useQuery({
    queryKey: onboardingKeys.state(),
    queryFn: () => api.get<OnboardingState>("/users/me/onboarding"),
  });
}

export function useUpdateOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<OnboardingState>) =>
      api.patch<OnboardingState>("/users/me/onboarding", data),
    onSuccess: (updated) => {
      queryClient.setQueryData(onboardingKeys.state(), updated);
    },
  });
}
