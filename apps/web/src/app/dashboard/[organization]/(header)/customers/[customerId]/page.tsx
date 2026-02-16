"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomersList } from "@/components/Customers/CustomersList";
import { CustomerDetails } from "@/components/Customers/CustomerDetails";
import { Search, ChevronDown, ChevronUp, MoreVertical, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DashboardBody } from "@/components/Layout/DashboardLayout";
import { useOrganizationSubscriptions } from "@/hooks/queries/subscriptions";
import { useListOrganizations } from "@/hooks/queries/organization";
import { useCreateCustomer } from "@/hooks/queries/customers";
import { useToast } from "@/hooks/use-toast";

interface CustomerDetailPageProps {
  params: Promise<{
    organization: string;
    customerId: string;
  }>;
}

export default function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { organization: organizationSlug, customerId } = use(params);
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [newCustomerData, setNewCustomerData] = useState({
    name: "",
    email: "",
    external_id: "",
  });
  const [newCustomerMetadata, setNewCustomerMetadata] = useState<Array<{ key: string; value: string }>>([
    { key: '', value: '' }
  ]);

  const { toast } = useToast();
  const createCustomer = useCreateCustomer();

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

  // Extract unique customers from subscriptions
  const customers = useMemo(() => {
    if (!subscriptions) return [];

    const customerMap = new Map();

    subscriptions.forEach((sub: any) => {
      const customer = sub.customer;

      if (customer && !customerMap.has(customer.id)) {
        const displayName = customer.name || customer.email;
        const initial = displayName?.charAt(0).toUpperCase() || '?';

        customerMap.set(customer.id, {
          id: customer.id,
          name: customer.name || customer.email,
          email: customer.email,
          avatar: initial,
          lifetimeRevenue: 0,
          orders: 0,
          balance: 0,
        });
      }
    });

    let allCustomers = Array.from(customerMap.values());

    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      allCustomers = allCustomers.filter(
        (customer: any) =>
          customer.name?.toLowerCase().includes(lowerQuery) ||
          customer.email?.toLowerCase().includes(lowerQuery)
      );
    }

    // Apply sorting (always enabled)
    allCustomers.sort((a: any, b: any) => {
      const nameA = (a.name || a.email || '').toLowerCase();
      const nameB = (b.name || b.email || '').toLowerCase();
      
      if (sortOrder === "asc") {
        return nameA.localeCompare(nameB);
      } else {
        return nameB.localeCompare(nameA);
      }
    });

    return allCustomers;
  }, [subscriptions, searchQuery, sortOrder]);

  // Find the currently selected customer based on URL param
  const selectedCustomer = useMemo(() => {
    return customers.find((c: any) => c.id === customerId) || null;
  }, [customers, customerId]);

  const handleSelectCustomer = (customer: any) => {
    router.push(`/dashboard/${organizationSlug}/customers/${customer.id}`);
  };

  return (
    <DashboardBody className="p-0 gap-0">
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Left Sidebar - Customers List */}
        <div className="w-80 border-r border-border flex flex-col bg-background">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border text-popover-foreground">
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
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => {
                  setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                }}
              >
                {sortOrder === "asc" ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
              {/* <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button> */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary"
                onClick={() => setIsAddCustomerOpen(true)}
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
              selectedCustomer={selectedCustomer}
              onSelectCustomer={handleSelectCustomer}
            />
          )}
        </div>

        {/* Right Side - Customer Details */}
        <div className="flex-1 overflow-auto">
          {selectedCustomer ? (
            <CustomerDetails
              customer={{
                ...selectedCustomer,
                subscriptions: subscriptions?.filter((sub: any) => sub.customer_id === selectedCustomer.id) || []
              }} 
              organizationId={org?.id}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Customer not found</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Customer Sheet */}
      <Sheet open={isAddCustomerOpen} onOpenChange={setIsAddCustomerOpen}>
        <SheetContent className="w-full sm:max-w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-2xl font-semibold">Add Customer</SheetTitle>
          </SheetHeader>
          
          <div className="mt-8 space-y-6">
            {/* Name Field */}
            <div className="space-y-2">
              <Label htmlFor="new-name" className="text-sm font-medium">
                Name
              </Label>
              <Input
                id="new-name"
                value={newCustomerData.name}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                placeholder="Enter customer name"
                className="text-foreground"
              />
            </div>

            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="new-email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="new-email"
                type="email"
                value={newCustomerData.email}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, email: e.target.value })}
                placeholder="Enter email address"
                className="text-foreground"
              />
            </div>

            {/* External ID Field */}
            <div className="space-y-2">
              <Label htmlFor="new-external-id" className="text-sm font-medium">
                External ID
              </Label>
              <Input
                id="new-external-id"
                value={newCustomerData.external_id}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, external_id: e.target.value })}
                placeholder="Enter external ID (optional)"
                className="text-foreground"
              />
            </div>

            {/* Metadata Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Metadata</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewCustomerMetadata([...newCustomerMetadata, { key: '', value: '' }])}
                  className="h-8 text-primary"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Field
                </Button>
              </div>
              
              {newCustomerMetadata.map((field, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Key"
                      value={field.key}
                      onChange={(e) => {
                        const updated = [...newCustomerMetadata];
                        updated[index].key = e.target.value;
                        setNewCustomerMetadata(updated);
                      }}
                      className="text-foreground"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Value"
                      value={field.value}
                      onChange={(e) => {
                        const updated = [...newCustomerMetadata];
                        updated[index].value = e.target.value;
                        setNewCustomerMetadata(updated);
                      }}
                      className="text-foreground"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const updated = newCustomerMetadata.filter((_, i) => i !== index);
                      setNewCustomerMetadata(updated.length > 0 ? updated : [{ key: '', value: '' }]);
                    }}
                    className="h-10 w-10 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Add Customer Button */}
            <Button
              onClick={async () => {
                try {
                  if (!org?.id) {
                    toast({
                      title: "Error",
                      description: "Organization not found",
                      variant: "destructive",
                    });
                    return;
                  }

                  // Convert metadata array to object
                  const metadata: Record<string, any> = {};
                  newCustomerMetadata.forEach(field => {
                    if (field.key && field.value) {
                      metadata[field.key] = field.value;
                    }
                  });

                  await createCustomer.mutateAsync({
                    organization_id: org.id,
                    name: newCustomerData.name,
                    email: newCustomerData.email,
                    ...(newCustomerData.external_id && { external_id: newCustomerData.external_id }),
                    ...(Object.keys(metadata).length > 0 && { metadata }),
                  });

                  toast({
                    title: "Customer created",
                    description: "New customer has been successfully created.",
                  });

                  setIsAddCustomerOpen(false);
                  // Reset form
                  setNewCustomerData({ name: "", email: "", external_id: "" });
                  setNewCustomerMetadata([{ key: '', value: '' }]);
                } catch (error: any) {
                  toast({
                    title: "Error creating customer",
                    description: error.message || "Failed to create customer.",
                    variant: "destructive",
                  });
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!newCustomerData.name || !newCustomerData.email}
            >
              Add Customer
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </DashboardBody>
  );
}
