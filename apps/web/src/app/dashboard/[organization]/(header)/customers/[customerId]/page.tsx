"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { CustomerDetails } from "@/components/Customers/CustomerDetails";
import { DashboardBody } from "@/components/Layout/DashboardLayout";
import { useOrganizationSubscriptions } from "@/hooks/queries/subscriptions";
import { useListOrganizations } from "@/hooks/queries/organization";
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface CustomerDetailPageProps {
  params: Promise<{
    organization: string;
    customerId: string;
  }>;
}

export default function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { organization: organizationSlug, customerId } = use(params);
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

  // Combined loading state
  const isLoading = isLoadingOrg || isLoadingSubs;

  // Find the specific customer from subscriptions
  const customer = useMemo(() => {
    if (!subscriptions) return null;

    // Find subscription for this customer
    const customerSub = subscriptions.find(
      (sub: any) => sub.customer_id === customerId
    );

    if (!customerSub?.customers) return null;

    const customerData = Array.isArray(customerSub.customers)
      ? customerSub.customers[0]
      : customerSub.customers;

    const displayName = customerData.name || customerData.email;
    const initial = displayName?.charAt(0).toUpperCase() || "?";

    return {
      id: customerData.id,
      name: customerData.name || customerData.email,
      email: customerData.email,
      avatar: initial,
      lifetimeRevenue: 0,
      orders: 0,
      balance: 0,
      subscriptions: subscriptions.filter((sub: any) => sub.customer_id === customerId) || [],
    };
  }, [subscriptions, customerId]);

  if (isLoading) {
    return (
      <DashboardBody className="p-0 gap-0">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p className="text-muted-foreground text-sm">Loading customer details...</p>
        </div>
      </DashboardBody>
    );
  }

  if (!customer) {
    return (
      <DashboardBody className="p-0 gap-0">
        <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-4">
          <p className="text-muted-foreground text-sm">Customer not found</p>
          <Button variant="secondary" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </DashboardBody>
    );
  }

  return (
    <DashboardBody className="p-0 gap-0">
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Back Button */}
        <div className="border-b border-border p-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>

        {/* Customer Details */}
        <div className="flex-1 overflow-auto">
          <CustomerDetails customer={customer} />
        </div>
      </div>
    </DashboardBody>
  );
}
