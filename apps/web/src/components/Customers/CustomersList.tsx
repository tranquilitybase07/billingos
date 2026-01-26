"use client";

import { cn } from "@/lib/utils";

interface Customer {
  id: string;
  name: string;
  email: string;
  avatar: string;
  lifetimeRevenue: number;
  orders: number;
  balance: number;
}

interface CustomersListProps {
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer) => void;
}

export function CustomersList({
  customers,
  selectedCustomer,
  onSelectCustomer,
}: CustomersListProps) {
  return (
    <div className="flex-1 overflow-auto">
      {customers.map((customer) => (
        <button
          key={customer.id}
          onClick={() => onSelectCustomer(customer)}
          className={cn(
            "w-full p-4 flex items-center gap-3  transition-colors border-b border-border",
            selectedCustomer?.id === customer.id && "bg-muted"
          )}
        >
          {/* Avatar */}
          <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-muted-foreground">
              {customer.avatar}
            </span>
          </div>

          {/* Customer Info */}
          <div className="flex-1 text-left min-w-0">
            <div className="font-medium truncate text-popover-foreground">{customer.name}</div>
            <div className="text-sm text-muted-foreground truncate">
              {customer.email}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
