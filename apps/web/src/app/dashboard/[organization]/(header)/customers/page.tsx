"use client";

import { useState } from "react";
import { CustomersList } from "@/components/Customers/CustomersList";
import { CustomerDetails } from "@/components/Customers/CustomerDetails";
import { Search, ChevronDown, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardBody } from "@/components/Layout/DashboardLayout";

// Dummy customer data
const DUMMY_CUSTOMERS = [
  {
    id: "1",
    name: "ramesh",
    email: "agsdgsqgsdhidsj@gmail.com",
    lifetimeRevenue: 0,
    orders: 0,
    balance: 0,
    avatar: "R",
  },
];

export default function CustomersPage() {
  const [selectedCustomer, setSelectedCustomer] = useState(DUMMY_CUSTOMERS[0]);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <DashboardBody className="p-0 gap-0">
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Left Sidebar - Customers List */}
        <div className="w-80 border-r border-border flex flex-col bg-background">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border text-popover-foreground">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-medium">Customers</h1>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search Customers"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-border"
              />
            </div>
          </div>

          {/* Customers List */}
          <CustomersList
            customers={DUMMY_CUSTOMERS}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={setSelectedCustomer}
          />
        </div>

        {/* Right Side - Customer Details */}
        <div className="flex-1 overflow-auto">
          <CustomerDetails customer={selectedCustomer} />
        </div>
      </div>
    </DashboardBody>
  );
}
