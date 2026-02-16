"use client";

import { use, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardBody } from "@/components/Layout/DashboardLayout";
import { useOrganizationSubscriptions } from "@/hooks/queries/subscriptions";
import { useListOrganizations } from "@/hooks/queries/organization";

interface CustomersPageProps {
  params: Promise<{
    organization: string;
  }>;
}

export default function CustomersPage({ params }: CustomersPageProps) {
  const { organization: organizationSlug } = use(params);
  const router = useRouter();
  
  // Fetch organizations list to convert slug to ID
  const { data: organizations, isLoading: isLoadingOrg } = useListOrganizations();

  // Find the organization by slug
  const org = useMemo(() => {
    if (!organizations) return null;
    return organizations.find((o) => o.slug === organizationSlug);
  }, [organizations, organizationSlug]);

  // Fetch all subscriptions using the organization ID
  const { data: subscriptions, isLoading: isLoadingSubs } = useOrganizationSubscriptions(org?.id);

  const isLoading = isLoadingOrg || isLoadingSubs;

  // Extract unique customers to find the first one
  const firstCustomerId = useMemo(() => {
    if (!subscriptions || subscriptions.length === 0) return null;
    
    // Find the first valid customer ID
    for (const sub of subscriptions) {
      if (sub.customers) {
        const customer = Array.isArray(sub.customers) ? sub.customers[0] : sub.customers;
        if (customer && customer.id) {
            return customer.id;
        }
      }
    }
    return null;
  }, [subscriptions]);

  // Auto-redirect to first customer
  useEffect(() => {
    if (!isLoading && firstCustomerId) {
      router.replace(`/dashboard/${organizationSlug}/customers/${firstCustomerId}`);
    }
  }, [isLoading, firstCustomerId, organizationSlug, router]);

  return (
    <DashboardBody className="p-0 gap-0">
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading customers...</p>
        ) : !firstCustomerId ? (
           <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-sm">No customers found</p>
            </div>
        ) : (
          <p className="text-muted-foreground text-sm">Redirecting...</p>
        )}
      </div>
    </DashboardBody>
  );
}
