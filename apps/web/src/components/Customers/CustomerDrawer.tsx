"use client";

import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { CustomerDetails } from "./CustomerDetails";
import type { Subscription } from "@/hooks/queries/subscriptions";

export interface EnrichedCustomer {
  id: string;
  name: string;
  email: string;
  country: string;
  created_at: string;
  avatarInitial: string;
  planName: string | null;
  subscriptionStatus: Subscription["status"] | null;
  mrr: number;
  churnRisk: "Low" | "Medium" | "High" | "Churned" | "N/A";
  cancelAtPeriodEnd: boolean;
  paused?: boolean;
  primarySubscriptionId: string | null;
  subscriptions: Subscription[];
  pendingDowngrade: {
    newProductName: string;
    newAmount: number;
    scheduledFor: string;
  } | null;
}

interface CustomerDrawerProps {
  customer: EnrichedCustomer | null;
  organizationId: string | undefined;
  open: boolean;
  onClose: () => void;
}

export function CustomerDrawer({
  customer,
  organizationId,
  open,
  onClose,
}: CustomerDrawerProps) {
  if (!customer) return null;

  // Shape customer for CustomerDetails
  const detailsCustomer = {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    avatar: customer.avatarInitial,
    created_at: customer.created_at,
    lifetimeRevenue: 0,
    orders: 0,
    balance: 0,
    subscriptions: customer.subscriptions,
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent className="w-full sm:max-w-[620px] p-0 overflow-y-auto flex flex-col">
        {/* Body */}
        <div className="flex-1">
          <CustomerDetails
            variant="drawer"
            customer={detailsCustomer}
            organizationId={organizationId}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
