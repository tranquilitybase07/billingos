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

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface CustomersListProps {
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function CustomersList({
  customers,
  selectedCustomer,
  onSelectCustomer,
  page,
  totalPages,
  onPageChange,
}: CustomersListProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className={cn("flex-1 overflow-y-auto", totalPages > 1 && "h-[80%] flex-none")}>
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
        {customers.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No customers found
          </div>
        )}
      </div>
      
      {totalPages > 1 && (
        <div className="h-[20%] p-3 border-t border-border flex items-center justify-between gap-2 bg-background">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(1)}
              disabled={page <= 1}
              className="h-8 w-8"
              title="First Page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
          </div>
          
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="h-8 px-2"
            >
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(totalPages)}
              disabled={page >= totalPages}
              className="h-8 w-8"
              title="Last Page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
