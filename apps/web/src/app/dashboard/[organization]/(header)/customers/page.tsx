"use client";

import { useState, useMemo, use } from "react";
import { CustomersList } from "@/components/Customers/CustomersList";
import { CustomerDetails } from "@/components/Customers/CustomerDetails";
import { Search, ChevronDown, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardBody } from "@/components/Layout/DashboardLayout";
import { useOrganizationSubscriptions } from "@/hooks/queries/subscriptions";
import { useListOrganizations } from "@/hooks/queries/organization";

interface CustomersPageProps {
  params: Promise<{
    organization: string;
  }>;
}

export default function CustomersPage({ params }: CustomersPageProps) {
  // Unwrap the params Promise (Next.js 15+)
  const { organization: organizationSlug } = use(params);
  
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch organizations list to convert slug to ID
  const { data: organizations, isLoading: isLoadingOrg } = useListOrganizations();

  // Find the organization by slug
  const org = useMemo(() => {
    if (!organizations) return null;
    return organizations.find((o) => o.slug === organizationSlug);
  }, [organizations, organizationSlug]);

  // Fetch all subscriptions using the organization ID
  const { data: subscriptions, isLoading: isLoadingSubs, error } = useOrganizationSubscriptions(org?.id);

  // Combined loading state
  const isLoading = isLoadingOrg || isLoadingSubs;



  // Extract unique customers from subscriptions and transform to expected format
  const customers = useMemo(() => {
    if (!subscriptions) return [];
    

    
    // Create a map to deduplicate customers by ID
    const customerMap = new Map();
    
    subscriptions.forEach((sub: any) => {

      
      // Note: Supabase returns joined data as an array, so we access sub.customers[0] or just sub.customers
      const customer = Array.isArray(sub.customers) ? sub.customers[0] : sub.customers;
      

      
      if (customer && !customerMap.has(customer.id)) {
        const displayName = customer.name || customer.email;
        const initial = displayName?.charAt(0).toUpperCase() || '?';
        
        customerMap.set(customer.id, {
          id: customer.id,
          name: customer.name || customer.email,
          email: customer.email,
          avatar: initial,
          lifetimeRevenue: 0, // Can be calculated from subscriptions if needed
          orders: 0,
          balance: 0,
        });
      }
    });

    // Convert map values to array and filter by search query
    let allCustomers = Array.from(customerMap.values());

    
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      allCustomers = allCustomers.filter(
        (customer: any) =>
          customer.name?.toLowerCase().includes(lowerQuery) ||
          customer.email?.toLowerCase().includes(lowerQuery)
      );
    }
    

    return allCustomers;
  }, [subscriptions, searchQuery]);

  const selectedCustomer = customers.find((c: any) => c.id === selectedCustomerId) || customers[0];

  // Auto-select first customer when data loads
  if (customers.length > 0 && !selectedCustomerId) {
    setSelectedCustomerId(customers[0].id);
  }

  return (
    <DashboardBody className="p-0 gap-0">
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Left Sidebar - Customers List */}
        <div className="w-80 border-r border-border flex flex-col bg-background">
          {/* Header */}
          <div className="flex items-center justify-between p-4  border-b border-border text-popover-foreground">
            {/* Search */}
          <div>
            <div className="relative mr-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search Customers"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-border"
              />
            </div>
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

          {/* Customers List */}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground text-sm">Loading customers...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-destructive text-sm text-center">
                Failed to load customers. Please try again.
              </p>
            </div>
          ) : customers.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-muted-foreground text-sm text-center">
                {searchQuery ? "No customers found" : "No customers yet"}
              </p>
            </div>
          ) : (
            <CustomersList
              customers={customers}
              selectedCustomer={selectedCustomer || null}
              onSelectCustomer={(customer) => setSelectedCustomerId(customer.id)}
            />
          )}
        </div>

        {/* Right Side - Customer Details */}
        <div className="flex-1 overflow-auto">
          {selectedCustomer ? (
            <CustomerDetails 
              customer={{
                ...selectedCustomer,
                subscriptions: subscriptions?.filter(sub => sub.customer_id === selectedCustomer.id) || []
              }} 
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Select a customer to view details</p>
            </div>
          )}
        </div>
      </div>
    </DashboardBody>
  );
}
