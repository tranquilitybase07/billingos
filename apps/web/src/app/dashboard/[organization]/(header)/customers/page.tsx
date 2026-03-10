"use client";

import { use, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { DashboardBody } from "@/components/Layout/DashboardLayout";
import { useOrganization } from "@/providers/OrganizationProvider";
import { useListCustomers, useCreateCustomer } from "@/hooks/queries/customers";
import { useOrganizationSubscriptions } from "@/hooks/queries/subscriptions";
import type { Subscription, Product } from "@/hooks/queries/subscriptions";
import type { Column, Row, ColumnDef } from "@tanstack/react-table";
import { useMRR, useChurnRate, useRevenueTrend } from "@/hooks/queries/analytics";
import { DataTable, DataTableColumnHeader } from "@/components/atoms/datatable";
import { SubscriptionStatus } from "@/components/Subscriptions/SubscriptionStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dollar01Icon,
  UserMultiple02Icon,
  Activity01Icon,
  UserMinus01Icon,
  Search01Icon,
  PlusSignIcon,
  Cancel01Icon,
  ChartIncreaseIcon,
  ChartDecreaseIcon,
} from "hugeicons-react";
import { CustomerDrawer, type EnrichedCustomer } from "@/components/Customers/CustomerDrawer";
import { useDebounce } from "@/hooks/use-debounce";
import { formatCurrency } from "@/utils/metrics";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────

type ChurnRisk = "Low" | "Medium" | "High" | "Churned" | "N/A";

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  active: 0,
  trialing: 1,
  past_due: 2,
  incomplete: 3,
  unpaid: 4,
  canceled: 5,
};

/** Returns monthly recurring amount in cents (same unit as sub.amount) */
function normaliseMRR(sub: Subscription): number {
  const price = sub.price;
  const interval: string = price?.recurring_interval ?? "month";
  const count: number = price?.recurring_interval_count ?? 1;
  const amount = sub.amount; // cents

  const monthlyAmount =
    interval === "year"
      ? amount / (12 * count)
      : interval === "week"
        ? (amount * 4) / count
        : interval === "day"
          ? (amount * 30) / count
          : amount / count; // month

  return monthlyAmount;
}

function getChurnRisk(sub: Subscription | null): ChurnRisk {
  if (!sub) return "N/A";
  if (sub.status === "canceled") return "Churned";
  if (sub.status === "past_due" || sub.status === "unpaid") return "High";
  if (sub.status === "trialing") return "Medium";
  if (sub.status === "active" && sub.cancel_at_period_end) return "Medium";
  if (sub.status === "active") return "Low";
  return "N/A";
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Stats Cards ───────────────────────────────────────────────────────────────

interface StatsCardsProps {
  mrr: number;
  mrrTrend: number | null;
  totalCustomers: number;
  activeCustomers: number;
  churnRate: number | null;
  churnTrend: number | null;
}

function TrendLine({ trend, inverted = false }: { trend: number | null; inverted?: boolean }) {
  if (trend === null) return null;
  const isPositive = inverted ? trend <= 0 : trend >= 0;
  return (
    <div className={`flex items-center gap-1 text-sm mt-2 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
      {isPositive ? <ChartIncreaseIcon size={14} /> : <ChartDecreaseIcon size={14} />}
      <span>{Math.abs(trend).toFixed(1)}% vs last month</span>
    </div>
  );
}

function StatsCards({ mrr, mrrTrend, totalCustomers, activeCustomers, churnRate, churnTrend }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total MRR</p>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Dollar01Icon size={15} className="text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{formatCurrency(mrr)}</div>
          {/* <TrendLine trend={mrrTrend} /> */}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Customers</p>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserMultiple02Icon size={15} className="text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{totalCustomers}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Customers</p>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Activity01Icon size={15} className="text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{activeCustomers}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Churn Rate</p>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserMinus01Icon size={15} className="text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">
            {churnRate !== null ? `${churnRate.toFixed(1)}%` : "0%"}
          </div>
          <TrendLine trend={churnTrend} inverted />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Churn Risk Color ──────────────────────────────────────────────────────────

function ChurnRiskLabel({ risk }: { risk: ChurnRisk }) {
  const cls =
    risk === "Low"
      ? "text-emerald-600 dark:text-emerald-400"
      : risk === "Medium"
        ? "text-yellow-600 dark:text-yellow-400"
        : risk === "High"
          ? "text-red-600 dark:text-red-400"
          : risk === "Churned"
            ? "text-gray-500 dark:text-gray-400"
            : "text-muted-foreground";
  return <span className={`text-sm font-medium ${cls}`}>{risk}</span>;
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface CustomersPageProps {
  params: Promise<{ organization: string }>;
}

export default function CustomersPage({ params }: CustomersPageProps) {
  const { organization: organizationSlug } = use(params);
  const { organization } = useOrganization();
  const orgId = organization.id;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCustomerId = searchParams.get("customer");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Add Customer sheet
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({ name: "", email: "", external_id: "" });
  const [newCustomerMetadata, setNewCustomerMetadata] = useState<Array<{ key: string; value: string }>>([
    { key: "", value: "" },
  ]);
  const { toast } = useToast();
  const createCustomer = useCreateCustomer();

  // Data fetching
  const { data: customersData, isLoading: isLoadingCustomers } = useListCustomers(orgId, {
    query: debouncedSearch,
    page,
    limit: 50,
  });
  const { data: subscriptions, isLoading: isLoadingSubs } = useOrganizationSubscriptions(orgId);
  const { data: mrrData } = useMRR(orgId);
  const { data: churnData } = useChurnRate({ organization_id: orgId });
  const { data: revenueTrend } = useRevenueTrend({ organization_id: orgId, granularity: "month" });

  const isLoading = isLoadingCustomers || isLoadingSubs;

  // Enrich customers
  const enrichedCustomers = useMemo<EnrichedCustomer[]>(() => {
    if (!customersData?.data) return [];

    // Build map: customerId → Subscription[]
    const subsByCustomer = new Map<string, Subscription[]>();
    subscriptions?.forEach((sub) => {
      const existing = subsByCustomer.get(sub.customer_id) ?? [];
      existing.push(sub);
      subsByCustomer.set(sub.customer_id, existing);
    });

    return customersData.data.map((customer) => {
      const customerSubs = subsByCustomer.get(customer.id) ?? [];

      // Pick primary subscription by priority
      const primarySub =
        customerSubs.slice().sort(
          (a, b) =>
            (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99)
        )[0] ?? null;

      const productField = primarySub?.product as Product | Product[] | undefined;
      const planName = productField
        ? (Array.isArray(productField) ? productField[0]?.name : productField.name) ?? null
        : null;

      const mrr = primarySub ? normaliseMRR(primarySub) : 0;

      const country = customer.billing_address?.country ?? "—";

      const displayName = customer.name || customer.email;
      const avatarInitial = displayName?.charAt(0).toUpperCase() ?? "?";

      return {
        id: customer.id,
        name: customer.name ?? customer.email,
        email: customer.email,
        country,
        created_at: customer.created_at,
        avatarInitial,
        planName,
        subscriptionStatus: primarySub?.status ?? null,
        mrr,
        churnRisk: getChurnRisk(primarySub),
        primarySubscriptionId: primarySub?.id ?? null,
        subscriptions: customerSubs,
      };
    });
  }, [customersData, subscriptions]);

  // Client-side status + plan filtering
  const filteredCustomers = useMemo(() => {
    return enrichedCustomers.filter((c) => {
      if (statusFilter !== "all" && c.subscriptionStatus !== statusFilter) return false;
      if (planFilter !== "all" && c.planName !== planFilter) return false;
      return true;
    });
  }, [enrichedCustomers, statusFilter, planFilter]);

  // Unique plan names for plan filter dropdown
  const uniquePlanNames = useMemo(() => {
    const names = new Set<string>();
    enrichedCustomers.forEach((c) => { if (c.planName) names.add(c.planName); });
    return Array.from(names).sort();
  }, [enrichedCustomers]);

  // Stats
  const totalMRR = mrrData?.mrr ?? 0;
  const totalCustomers = customersData?.total ?? 0;
  const activeCustomers = useMemo(
    () => filteredCustomers.filter((c) => c.subscriptionStatus === "active" || c.subscriptionStatus === "trialing").length,
    [filteredCustomers]
  );
  const latestChurnRate = useMemo(() => {
    const data = churnData?.data;
    if (!data || data.length === 0) return null;
    return data[data.length - 1].churn_rate ?? null;
  }, [churnData]);

  // Trends
  const mrrTrend = useMemo(() => {
    const pts = revenueTrend?.data ?? [];
    if (pts.length < 2) return null;
    const prev = pts[pts.length - 2].revenue;
    const curr = pts[pts.length - 1].revenue;
    if (!prev) return null;
    return ((curr - prev) / prev) * 100;
  }, [revenueTrend]);
  const churnTrend = useMemo(() => {
    const pts = churnData?.data ?? [];
    if (pts.length < 2) return null;
    const prev = pts[pts.length - 2].churn_rate;
    const curr = pts[pts.length - 1].churn_rate;
    if (!prev) return null;
    return ((curr - prev) / prev) * 100;
  }, [churnData]);

  // Drawer state via URL
  const selectedCustomer = useMemo(
    () => enrichedCustomers.find((c) => c.id === selectedCustomerId) ?? null,
    [enrichedCustomers, selectedCustomerId]
  );

  const openDrawer = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("customer", id);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const closeDrawer = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("customer");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  // DataTable columns
  const columns = useMemo<ColumnDef<EnrichedCustomer>[]>(
    () => [
      {
        id: "customer",
        header: ({ column }: { column: Column<EnrichedCustomer> }) => <DataTableColumnHeader column={column} title="Customer" />,
        cell: ({ row }: { row: Row<EnrichedCustomer> }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-accent-foreground flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-medium text-muted-foreground">{c.avatarInitial}</span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-popover-foreground truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground truncate">{c.email}</div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "country",
        header: ({ column }: { column: Column<EnrichedCustomer> }) => <DataTableColumnHeader column={column} title="Country" />,
        cell: ({ row }: { row: Row<EnrichedCustomer> }) => (
          <span className="text-sm text-muted-foreground">{row.original.country}</span>
        ),
      },
      {
        accessorKey: "planName",
        header: ({ column }: { column: Column<EnrichedCustomer> }) => <DataTableColumnHeader column={column} title="Plan" />,
        cell: ({ row }: { row: Row<EnrichedCustomer> }) => {
          const planName = row.original.planName;
          return planName ? (
            <Badge variant="secondary">{planName}</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "subscriptionStatus",
        header: ({ column }: { column: Column<EnrichedCustomer> }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }: { row: Row<EnrichedCustomer> }) => {
          const status = row.original.subscriptionStatus;
          return status ? (
            <SubscriptionStatus status={status} />
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "mrr",
        header: ({ column }: { column: Column<EnrichedCustomer> }) => <DataTableColumnHeader column={column} title="MRR" />,
        cell: ({ row }: { row: Row<EnrichedCustomer> }) => {
          const mrr = row.original.mrr;
          return (
            <span className="text-sm">{mrr > 0 ? formatCurrency(mrr) : "—"}</span>
          );
        },
      },
      {
        accessorKey: "churnRisk",
        header: ({ column }: { column: Column<EnrichedCustomer> }) => <DataTableColumnHeader column={column} title="Churn Risk" />,
        cell: ({ row }: { row: Row<EnrichedCustomer> }) => <ChurnRiskLabel risk={row.original.churnRisk} />,
      },
      {
        accessorKey: "created_at",
        header: ({ column }: { column: Column<EnrichedCustomer> }) => <DataTableColumnHeader column={column} title="Member Since" />,
        cell: ({ row }: { row: Row<EnrichedCustomer> }) => (
          <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
        ),
      },
    ],
    []
  );

  return (
    <DashboardBody title="Customers">
      <div className="space-y-6">
        {/* Stats row */}
        <StatsCards
          mrr={totalMRR}
          mrrTrend={mrrTrend}
          totalCustomers={totalCustomers}
          activeCustomers={activeCustomers}
          churnRate={latestChurnRate}
          churnTrend={churnTrend}
        />

        {/* Filters + Add Customer */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search01Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-9 text-foreground"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="trialing">Trialing</SelectItem>
              <SelectItem value="past_due">Past Due</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              {uniquePlanNames.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            className="ml-auto bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => setIsAddCustomerOpen(true)}
          >
            <PlusSignIcon size={16} className="mr-2" />
            Add Customer
          </Button>
        </div>

        {/* Table */}
        <DataTable
          data={filteredCustomers}
          columns={columns}
          isLoading={isLoading}
          onRowClick={(row) => openDrawer(row.original.id)}
        />
      </div>

      {/* Customer drawer */}
      <CustomerDrawer
        customer={selectedCustomer}
        organizationId={orgId}
        open={!!selectedCustomerId}
        onClose={closeDrawer}
      />

      {/* Add Customer Sheet */}
      <Sheet open={isAddCustomerOpen} onOpenChange={setIsAddCustomerOpen}>
        <SheetContent className="w-full sm:max-w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-2xl font-semibold">Add Customer</SheetTitle>
          </SheetHeader>

          <div className="mt-8 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="new-name" className="text-sm font-medium">Name</Label>
              <Input
                id="new-name"
                value={newCustomerData.name}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                placeholder="Enter customer name"
                className="text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-email" className="text-sm font-medium">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={newCustomerData.email}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, email: e.target.value })}
                placeholder="Enter email address"
                className="text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-external-id" className="text-sm font-medium">External ID</Label>
              <Input
                id="new-external-id"
                value={newCustomerData.external_id}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, external_id: e.target.value })}
                placeholder="Enter external ID (optional)"
                className="text-foreground"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Metadata</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewCustomerMetadata([...newCustomerMetadata, { key: "", value: "" }])}
                  className="h-8 text-primary"
                >
                  <PlusSignIcon size={16} className="mr-1" />
                  Add Field
                </Button>
              </div>

              {newCustomerMetadata.map((field, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1">
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
                  <div className="flex-1">
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
                      setNewCustomerMetadata(updated.length > 0 ? updated : [{ key: "", value: "" }]);
                    }}
                    className="h-10 w-10 text-muted-foreground hover:text-destructive"
                  >
                    <Cancel01Icon size={16} />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              onClick={async () => {
                try {
                  if (!orgId) {
                    toast({ title: "Error", description: "Organization not found", variant: "destructive" });
                    return;
                  }

                  const metadata: Record<string, string> = {};
                  newCustomerMetadata.forEach((field) => {
                    if (field.key && field.value) metadata[field.key] = field.value;
                  });

                  await createCustomer.mutateAsync({
                    organization_id: orgId,
                    name: newCustomerData.name,
                    email: newCustomerData.email,
                    ...(newCustomerData.external_id && { external_id: newCustomerData.external_id }),
                    ...(Object.keys(metadata).length > 0 && { metadata }),
                  });

                  toast({ title: "Customer created", description: "New customer has been successfully created." });
                  setIsAddCustomerOpen(false);
                  setNewCustomerData({ name: "", email: "", external_id: "" });
                  setNewCustomerMetadata([{ key: "", value: "" }]);
                } catch (error: unknown) {
                  const message = error instanceof Error ? error.message : "Failed to create customer.";
                  toast({ title: "Error creating customer", description: message, variant: "destructive" });
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
