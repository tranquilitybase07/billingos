"use client";

import { useState } from "react";
import { Calendar, MoreVertical, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "./RevenueChart";
import { TableSection } from "./TableSection";

interface Customer {
  id: string;
  name: string;
  email: string;
  avatar: string;
  lifetimeRevenue: number;
  orders: number;
  balance: number;
}

interface CustomerDetailsProps {
  customer: Customer;
}

export function CustomerDetails({ customer }: CustomerDetailsProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "events" | "usage">(
    "overview"
  );
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Dummy customer details data
  const customerDetailsData = {
    id: "315bdb07-c364-4198-a468-8bef72cde466",
    externalId: "—",
    email: "agsgdsgdsdhldgj@gmail.com",
    name: "ramesh",
    taxId: "—",
    createdAt: "Jan 6, 2026",
  };

  const billingAddressData = {
    line1: "—",
    line2: "—",
    city: "—",
    state: "—",
    postalCode: "—",
    country: "—",
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-start justify-between">
          {/* Customer Info */}
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-accent-foreground flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-medium text-muted-foreground">
                {customer.avatar}
              </span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-popover-foreground">
                {customer.name}
              </h1>
              <p className="text-muted-foreground mt-1">{customer.email}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 text-popover-foreground">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="bg-base">
                  Daily
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Hourly</DropdownMenuItem>
                <DropdownMenuItem>Daily</DropdownMenuItem>
                <DropdownMenuItem>Weekly</DropdownMenuItem>
                <DropdownMenuItem>Monthly</DropdownMenuItem>
                <DropdownMenuItem>Yearly</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" size="icon" className="bg-base">
              <Calendar className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="bg-base">
                  All Time
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Today</DropdownMenuItem>
                <DropdownMenuItem>Yesterday</DropdownMenuItem>
                <DropdownMenuItem>This Week</DropdownMenuItem>
                <DropdownMenuItem>This Month</DropdownMenuItem>
                <DropdownMenuItem>Last Month</DropdownMenuItem>
                <DropdownMenuItem>Last 3 Month</DropdownMenuItem>
                <DropdownMenuItem>This Year</DropdownMenuItem>
                <DropdownMenuItem>Last Year</DropdownMenuItem>
                <DropdownMenuItem>All Time</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Copy Customer Portal</DropdownMenuItem>
                <DropdownMenuItem>Contact Customer</DropdownMenuItem>
                <DropdownMenuItem className="border-b pb-3">
                  Edit Customer
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600 font-medium">
                  Delete Customer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-8 px-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-4 px-1 border-b-2 transition-colors hover:cursor-pointer ${
              activeTab === "overview"
                ? "border-primary text-popover-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-accent-foreground font-medium"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("events")}
            className={`py-4 px-1 border-b-2 transition-colors hover:cursor-pointer ${
              activeTab === "events"
                ? "border-primary text-popover-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-accent-foreground font-medium"
            }`}
          >
            Events
          </button>
          <button
            onClick={() => setActiveTab("usage")}
            className={`py-4 px-1 border-b-2 transition-colors hover:cursor-pointer ${
              activeTab === "usage"
                ? "border-primary text-popover-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-accent-foreground font-medium"
            }`}
          >
            Usage
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    Lifetime Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">${customer.lifetimeRevenue}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    Orders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">-</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    Customer Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">-</div>
                </CardContent>
              </Card>
            </div>

            {/* Revenue Chart */}
            <Card>
              <CardContent className="pt-6">
                <RevenueChart />
              </CardContent>
            </Card>

            <TableSection
              title="Subscriptions"
              columns={[
                { title: "Product Name", key: "productName" },
                { title: "Status", key: "status" },
                { title: "Amount", key: "amount" },
              ]}
              data={[]} // currently no data
            />

            <TableSection
              title="Orders"
              columns={[
                { title: "Description", key: "description" },
                { title: "Created At", key: "createdAt" },
                { title: "Amount", key: "amount" },
              ]}
              data={[]}
            />

            <TableSection
              title="Benefit Grants"
              columns={[
                { title: "Benefit Name", key: "benefitName" },
                { title: "Status", key: "status" },
                { title: "Granted At", key: "grantedAt" },
                { title: "Revoked At", key: "revokedAt" },
              ]}
              data={[]}
            />

            {/* Customer Details Section */}
            <Card className="p-6">
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-popover-foreground mb-6">
                    Customer Details
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <div className="text-muted-foreground text-sm">ID</div>
                      <div className="text-muted-foreground text-sm">
                        External ID
                      </div>
                      <div className="text-muted-foreground text-sm">Email</div>
                      <div className="text-muted-foreground text-sm">Name</div>
                      <div className="text-muted-foreground text-sm">
                        Tax ID
                      </div>
                      <div className="text-muted-foreground text-sm">
                        Created At
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="text-popover-foreground text-sm font-medium">
                        {customerDetailsData.id}
                      </div>
                      <div className="text-popover-foreground text-sm font-medium">
                        {customerDetailsData.externalId}
                      </div>
                      <div className="text-popover-foreground text-sm font-medium">
                        {customerDetailsData.email}
                      </div>
                      <div className="text-popover-foreground text-sm font-medium">
                        {customerDetailsData.name}
                      </div>
                      <div className="text-popover-foreground text-sm font-medium">
                        {customerDetailsData.taxId}
                      </div>
                      <div className="text-popover-foreground text-sm font-medium">
                        {customerDetailsData.createdAt}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Billing Address Section */}
                <div>
                  <h2 className="text-xl font-semibold text-popover-foreground mb-6">
                    Billing Address
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <div className="text-muted-foreground text-sm">
                        Line 1
                      </div>
                      <div className="text-muted-foreground text-sm">
                        Line 2
                      </div>
                      <div className="text-muted-foreground text-sm">City</div>
                      <div className="text-muted-foreground text-sm">State</div>
                      <div className="text-muted-foreground text-sm">
                        Postal Code
                      </div>
                      <div className="text-muted-foreground text-sm">
                        Country
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="text-popover-foreground text-sm font-medium">
                        {billingAddressData.line1}
                      </div>
                      <div className="text-popover-foreground text-sm font-medium">
                        {billingAddressData.line2}
                      </div>
                      <div className="text-popover-foreground text-sm font-medium">
                        {billingAddressData.city}
                      </div>
                      <div className="text-popover-foreground text-sm font-medium">
                        {billingAddressData.state}
                      </div>
                      <div className="text-popover-foreground text-sm font-medium">
                        {billingAddressData.postalCode}
                      </div>
                      <div className="text-popover-foreground text-sm font-medium">
                        {billingAddressData.country}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Metadata Section */}
                <div>
                  <h2 className="text-xl font-semibold text-popover-foreground mb-6">
                    Metadata
                  </h2>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === "events" && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex items-center gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-2 bg-base text-popover-foreground"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M2 4h12M4 8h8M6 12h4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    All Events
                    <ChevronDown className="h-4 w-4 ml-1 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem>All Events</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-2 text-popover-foreground bg-base"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-popover-foreground"
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                      <circle cx="8" cy="8" r="2" fill="currentColor" />
                    </svg>
                    All Meters
                    <ChevronDown className="h-4 w-4 ml-1 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem>All Meters</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Events List */}
            <div className="space-y-2">
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between p-4 hover:bg-base transition-colors">
                  <div className="flex items-center gap-4 max-w-fit">
                    <ChevronDown className={`h-4 w-4 text-popover-foreground transition-transform duration-200 ${expandedEventId === "event-1" ? "" : "-rotate-90"}`} />
                    <span className="text-sm font-medium text-popover-foreground">
                      Customer Created
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/10 text-blue-500">
                      System
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Jan 06, 2026 {expandedEventId === "event-1" ? (<span>
                        <span>,</span><span className="ml-2">11:34:53 AM</span>
                      </span>) : ("")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 px-7 hover:bg-base hover:cursor-pointer"
                      onClick={() =>
                        setExpandedEventId(
                          expandedEventId === "event-1" ? null : "event-1"
                        )
                      }
                    >
                      {expandedEventId === "event-1" ? (<span>Hide</span>):(<span>View</span>)}
                    </Button>
                    {/* {expandedEventId === "event-1" ? (""):(<div className="h-8 w-8 rounded-full flex items-center justify-center bg-accent-foreground">
                      <span className="text-xs font-medium">{customer.avatar}</span>
                    </div>)} */}

                    <div className={`h-8 w-8 rounded-full flex items-center justify-center bg-accent-foreground ${expandedEventId === "event-1" ? "opacity-0 transition-opacity duration-100":"opacity-100 transition-opacity duration-100"}`}>
                      <span className="text-xs font-medium">{customer.avatar}</span>
                    </div>
                    
                  </div>
                </div>

                {/* Expanded User Info */}
                <div
                  className={`border-t border-border bg-base/50 overflow-hidden transition-all duration-300 ease-in-out ${
                    expandedEventId === "event-1"
                      ? "max-h-20 opacity-100"
                      : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center bg-accent-foreground">
                        <span className="text-xs font-medium">{customer.avatar}</span>
                      </div>
                      <span className="text-sm text-popover-foreground">
                        {customer.name}
                      </span>
                    </div>
                    <div>
                      <Button variant={"ghost"} className="hover:bg-base hover:cursor-pointer">
                        <span>View Analytics</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "usage" && (
          <div className="text-center py-10 ">
            <h2 className="text-lg mb-2 text-popover-foreground font-medium">
              No active meter
            </h2>
            <p className="text-muted-foreground font-normal text-base">
              This customer has no active meters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
