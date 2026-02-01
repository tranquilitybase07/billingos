# Aakash - Merchant Dashboard Tasks (Customers + Analytics)

**Role:** Frontend Developer (Merchant Dashboard)
**Sprint Duration:** 2-3 weeks
**Total Tasks:** 7

## Week 1: Customers Page (Days 1-5)

### Task 1: Study Polar's Customers Implementation ⭐ RESEARCH
**Estimated Time:** 6-8 hours (Day 1)
**Dependencies:** None
**Deliverable:** Documentation of Polar's patterns

#### Description
Deep dive into Polar's customers implementation to understand UI patterns, DataTable setup, filters, and actions.

#### Research Steps
1. **Navigate to Polar Repository**
   - Location: `/Users/ankushkumar/Code/payment/billingos` (Polar repo)
   - Focus areas: Customers pages, components, hooks

2. **Analyze Frontend Structure**
   ```bash
   cd /Users/ankushkumar/Code/payment/billingos
   # Find customers-related files
   find . -name "*customer*" -type f | grep -E "\.(tsx|ts)$"
   ```

3. **Document Key Findings** (`docs/sprint-beta-launch/polar-customers-analysis.md`)
   - **Page Structure:**
     - Layout components used
     - DataTable configuration
     - Filter UI patterns
     - Action buttons and modals

   - **Component Architecture:**
     - CustomerListItem component
     - CustomerDetailModal/Page
     - Filter components
     - Export functionality

   - **Data Fetching:**
     - React Query hooks used
     - Pagination strategy
     - Real-time updates
     - Optimistic updates

   - **Features to Copy:**
     - Search by email/name
     - Filter by status (active/inactive/churned)
     - Filter by subscription tier
     - Date range filtering
     - Bulk actions (if any)
     - Export to CSV (if any)

4. **Identify Components to Copy**
   - List exact files to copy from Polar
   - Note adaptations needed for BillingOS structure
   - Identify shadcn/ui components to use

5. **Create Component Inventory**
   ```markdown
   ## Components to Build
   1. CustomersPage.tsx - Main page wrapper
   2. CustomersDataTable.tsx - Table with filters
   3. CustomerRow.tsx - Individual row component
   4. CustomerFilters.tsx - Filter controls
   5. CustomerDetailSheet.tsx - Detail view drawer
   6. CustomerActions.tsx - Action dropdown menu
   ```

6. **Create Wire frames/Screenshots**
   - Take screenshots of Polar's customers page
   - Document layout structure
   - Note responsive behavior

#### Deliverables
- `docs/sprint-beta-launch/polar-customers-analysis.md` - Research document
- Component list with file paths from Polar
- UI/UX notes and design decisions
- List of shadcn/ui components needed

---

### Task 2: Create Customers Page UI ⭐ HIGH PRIORITY
**Estimated Time:** 8-12 hours (Days 2-3)
**Dependencies:** Task 1 complete, Ankush's Customers API ready (Day 2)
**Blocks:** Customer detail page

#### Description
Build complete customers management page with DataTable, filters, and actions.

#### Implementation Steps

##### Step 1: Create Page Structure
```typescript
// apps/web/src/app/dashboard/[organization]/customers/page.tsx
import { CustomersPage } from '@/components/Customers/CustomersPage';

export default async function CustomersPageRoute({
  params,
}: {
  params: { organization: string };
}) {
  const organizationId = params.organization;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">
            Manage your customers and their subscriptions
          </p>
        </div>
        {/* Add customer button if needed */}
      </div>
      <CustomersPage organizationId={organizationId} />
    </div>
  );
}
```

##### Step 2: Create CustomersPage Component
```typescript
// apps/web/src/components/Customers/CustomersPage.tsx
'use client';

import { useState } from 'react';
import { useCustomers } from '@/hooks/queries/customers';
import { CustomersDataTable } from './CustomersDataTable';
import { CustomerFilters, type FilterState } from './CustomerFilters';
import { Skeleton } from '@/components/ui/skeleton';

interface CustomersPageProps {
  organizationId: string;
}

export function CustomersPage({ organizationId }: CustomersPageProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: 'all',
    subscriptionTier: 'all',
    dateRange: null,
  });

  const { data, isLoading, error } = useCustomers(organizationId, filters);

  if (isLoading) return <CustomersPageSkeleton />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-4">
      <CustomerFilters filters={filters} onFiltersChange={setFilters} />
      <CustomersDataTable data={data?.customers ?? []} />
    </div>
  );
}
```

##### Step 3: Create DataTable Component (Reference shadcn/ui DataTable pattern)
```typescript
// apps/web/src/components/Customers/CustomersDataTable.tsx
'use client';

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CustomerActions } from './CustomerActions';
import { Badge } from '@/components/ui/badge';

type Customer = {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive' | 'churned';
  subscription: {
    planName: string;
    status: string;
  } | null;
  createdAt: string;
  totalRevenue: number;
};

export const columns: ColumnDef<Customer>[] = [
  {
    accessorKey: 'name',
    header: 'Customer',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        <div className="text-sm text-muted-foreground">{row.original.email}</div>
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.status;
      return (
        <Badge variant={status === 'active' ? 'default' : 'secondary'}>
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'subscription',
    header: 'Subscription',
    cell: ({ row }) => {
      const sub = row.original.subscription;
      if (!sub) return <span className="text-muted-foreground">None</span>;
      return (
        <div>
          <div className="font-medium">{sub.planName}</div>
          <div className="text-sm text-muted-foreground capitalize">{sub.status}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'totalRevenue',
    header: 'Revenue',
    cell: ({ row }) => {
      const amount = row.original.totalRevenue;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount / 100);
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => {
      const date = new Date(row.original.createdAt);
      return <span className="text-sm">{date.toLocaleDateString()}</span>;
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <CustomerActions customer={row.original} />,
  },
];

export function CustomersDataTable({ data }: { data: Customer[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No customers found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

##### Step 4: Create Filters Component
```typescript
// apps/web/src/components/Customers/CustomerFilters.tsx
'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type FilterState = {
  search: string;
  status: 'all' | 'active' | 'inactive' | 'churned';
  subscriptionTier: string;
  dateRange: { from: Date; to: Date } | null;
};

interface CustomerFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

export function CustomerFilters({ filters, onFiltersChange }: CustomerFiltersProps) {
  return (
    <div className="flex items-center gap-4">
      <Input
        placeholder="Search by email or name..."
        value={filters.search}
        onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
        className="max-w-sm"
      />

      <Select
        value={filters.status}
        onValueChange={(value) => onFiltersChange({ ...filters, status: value as FilterState['status'] })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
          <SelectItem value="churned">Churned</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.subscriptionTier}
        onValueChange={(value) => onFiltersChange({ ...filters, subscriptionTier: value })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Plan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Plans</SelectItem>
          {/* Dynamic plan options from useProducts */}
        </SelectContent>
      </Select>
    </div>
  );
}
```

##### Step 5: Create Actions Component
```typescript
// apps/web/src/components/Customers/CustomerActions.tsx
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Eye, CreditCard, Ban } from 'lucide-react';

export function CustomerActions({ customer }: { customer: any }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => {/* View details */}}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {/* Manage subscription */}}>
          <CreditCard className="mr-2 h-4 w-4" />
          Manage Subscription
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {/* Cancel subscription */}} className="text-destructive">
          <Ban className="mr-2 h-4 w-4" />
          Cancel Subscription
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

#### Files to Create
- `apps/web/src/app/dashboard/[organization]/customers/page.tsx`
- `apps/web/src/components/Customers/CustomersPage.tsx`
- `apps/web/src/components/Customers/CustomersDataTable.tsx`
- `apps/web/src/components/Customers/CustomerFilters.tsx`
- `apps/web/src/components/Customers/CustomerActions.tsx`
- `apps/web/src/components/Customers/CustomerPageSkeleton.tsx`

#### Testing Checklist
- [ ] Table displays customer data correctly
- [ ] Search filter works in real-time
- [ ] Status filter updates table
- [ ] Subscription tier filter works
- [ ] Sorting by columns works
- [ ] Actions dropdown functional
- [ ] Loading states display properly
- [ ] Empty state shows when no customers
- [ ] Mobile responsive layout

---

### Task 3: Create React Query Hooks for Customers ⭐ HIGH PRIORITY
**Estimated Time:** 3-4 hours (Day 2)
**Dependencies:** Ankush's Customers API ready (Day 2)
**Blocks:** Task 2 (CustomersPage needs these hooks)

#### Description
Build React Query hooks for all customer operations.

#### Implementation
```typescript
// apps/web/src/hooks/queries/customers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

// Types
export type Customer = {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive' | 'churned';
  subscription: {
    id: string;
    planName: string;
    status: string;
  } | null;
  createdAt: string;
  totalRevenue: number;
  metadata?: Record<string, any>;
};

export type CustomersListResponse = {
  customers: Customer[];
  total: number;
  page: number;
  limit: number;
};

export type CustomerFilters = {
  search?: string;
  status?: string;
  subscriptionTier?: string;
  dateRange?: { from: Date; to: Date };
};

// Query Keys
export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (orgId: string, filters: CustomerFilters) =>
    [...customerKeys.lists(), orgId, filters] as const,
  details: () => [...customerKeys.all, 'detail'] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
};

// Hooks
export function useCustomers(organizationId: string, filters: CustomerFilters = {}) {
  return useQuery({
    queryKey: customerKeys.list(organizationId, filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.status && filters.status !== 'all') params.append('status', filters.status);
      if (filters.subscriptionTier && filters.subscriptionTier !== 'all') {
        params.append('subscriptionTier', filters.subscriptionTier);
      }

      const response = await apiClient.get<CustomersListResponse>(
        `/customers?${params.toString()}`
      );
      return response;
    },
    staleTime: 30000, // 30 seconds
  });
}

export function useCustomer(customerId: string) {
  return useQuery({
    queryKey: customerKeys.detail(customerId),
    queryFn: async () => {
      const response = await apiClient.get<Customer>(`/customers/${customerId}`);
      return response;
    },
    enabled: !!customerId,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; email: string; metadata?: Record<string, any> }) => {
      return apiClient.post<Customer>('/customers', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Customer> }) => {
      return apiClient.patch<Customer>(`/customers/${id}`, data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customerId: string) => {
      return apiClient.delete(`/customers/${customerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
    },
  });
}
```

#### Also Update Index File
```typescript
// apps/web/src/hooks/queries/index.ts
export * from './customers';
export * from './products';
export * from './features';
export * from './subscriptions'; // Abdul will create this
export * from './analytics'; // You'll create this in Task 7
```

#### Files to Create
- `apps/web/src/hooks/queries/customers.ts`

#### Testing Checklist
- [ ] useCustomers fetches and displays data
- [ ] Filters work correctly
- [ ] useCustomer fetches single customer
- [ ] useCreateCustomer mutation works
- [ ] useUpdateCustomer mutation works
- [ ] Cache invalidation works properly
- [ ] Loading and error states handled

---

### Task 4: Customer Detail Page/Modal
**Estimated Time:** 4-6 hours (Day 4)
**Dependencies:** Tasks 2 & 3 complete

#### Description
Build detailed view for individual customer with subscription history and quick actions.

#### Implementation
```typescript
// apps/web/src/components/Customers/CustomerDetailSheet.tsx
'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCustomer } from '@/hooks/queries/customers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CustomerDetailSheetProps {
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerDetailSheet({ customerId, open, onOpenChange }: CustomerDetailSheetProps) {
  const { data: customer, isLoading } = useCustomer(customerId!);

  if (!customerId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Customer Details</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div>Loading...</div>
        ) : customer ? (
          <div className="mt-6 space-y-6">
            {/* Customer Info */}
            <Card>
              <CardHeader>
                <CardTitle>Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <div className="text-sm font-medium">Name</div>
                  <div className="text-sm text-muted-foreground">{customer.name}</div>
                </div>
                <div>
                  <div className="text-sm font-medium">Email</div>
                  <div className="text-sm text-muted-foreground">{customer.email}</div>
                </div>
                <div>
                  <div className="text-sm font-medium">Status</div>
                  <Badge variant={customer.status === 'active' ? 'default' : 'secondary'}>
                    {customer.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium">Total Revenue</div>
                  <div className="text-lg font-semibold">
                    ${(customer.totalRevenue / 100).toFixed(2)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs for Subscription, Invoices, Activity */}
            <Tabs defaultValue="subscription">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="subscription">Subscription</TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="subscription">
                {/* Subscription details */}
              </TabsContent>

              <TabsContent value="invoices">
                {/* Invoice history */}
              </TabsContent>

              <TabsContent value="activity">
                {/* Activity log */}
              </TabsContent>
            </Tabs>

            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button variant="outline" className="w-full">
                Upgrade Plan
              </Button>
              <Button variant="outline" className="w-full">
                Cancel Subscription
              </Button>
            </div>
          </div>
        ) : (
          <div>Customer not found</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

#### Integrate with DataTable
```typescript
// Update CustomersDataTable.tsx to open sheet on row click
const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
const [sheetOpen, setSheetOpen] = useState(false);

// In TableRow
<TableRow
  key={row.id}
  className="cursor-pointer hover:bg-muted/50"
  onClick={() => {
    setSelectedCustomerId(row.original.id);
    setSheetOpen(true);
  }}
>
```

#### Files to Create
- `apps/web/src/components/Customers/CustomerDetailSheet.tsx`

#### Testing Checklist
- [ ] Sheet opens on row click
- [ ] Customer data displays correctly
- [ ] Tabs switch properly
- [ ] Quick actions trigger correct functions
- [ ] Sheet closes and clears state

---

## Week 2: Analytics Dashboard (Days 6-10)

### Task 5: Study Polar's Analytics Implementation ⭐ RESEARCH
**Estimated Time:** 6-8 hours (Day 6)
**Dependencies:** None
**Deliverable:** Documentation of Polar's analytics patterns

#### Research Steps
1. **Navigate to Polar's Analytics Pages**
   ```bash
   cd /Users/ankushkumar/Code/payment/billingos
   find . -name "*analytic*" -o -name "*dashboard*" | grep -E "\.(tsx|ts)$"
   ```

2. **Document Key Findings** (`docs/sprint-beta-launch/polar-analytics-analysis.md`)
   - **Chart Library:** Which library does Polar use? (Recharts, Chart.js, Victory?)
   - **Dashboard Layout:** Grid system, card structure
   - **Metrics Cards:** How are KPIs displayed?
   - **Chart Types:** Line charts, bar charts, pie charts
   - **Date Range Picker:** Implementation pattern
   - **Data Aggregation:** How data is grouped (daily, weekly, monthly)

3. **Identify Components to Copy**
   - MetricCard component
   - RevenueChart component
   - SubscriptionGrowthChart
   - ChurnRateChart
   - DateRangePicker
   - Dashboard layout wrapper

4. **Create Component Inventory**
   ```markdown
   ## Analytics Components to Build
   1. AnalyticsPage.tsx - Main dashboard
   2. MetricsOverview.tsx - KPI cards section
   3. RevenueChart.tsx - MRR trend chart
   4. SubscriptionGrowthChart.tsx - Active subs over time
   5. ChurnRateDisplay.tsx - Churn metrics
   6. AnalyticsFilters.tsx - Date range picker
   ```

#### Deliverables
- `docs/sprint-beta-launch/polar-analytics-analysis.md`
- Component list with Polar file references
- Chart library selection decision
- UI mockup/wireframe

---

### Task 6: Create Analytics Dashboard Page ⭐ HIGH PRIORITY
**Estimated Time:** 10-14 hours (Days 7-9)
**Dependencies:** Task 5 complete, Ankush's Analytics API ready (Day 3)

#### Description
Build comprehensive analytics dashboard with MRR, active subscriptions, churn rate, and revenue trends.

#### Implementation Steps

##### Step 1: Install Chart Library (If Not Already)
```bash
cd apps/web
pnpm add recharts
pnpm add date-fns
```

##### Step 2: Create Page Structure
```typescript
// apps/web/src/app/dashboard/[organization]/analytics/page.tsx
import { AnalyticsPage } from '@/components/Analytics/AnalyticsPage';

export default async function AnalyticsPageRoute({
  params,
}: {
  params: { organization: string };
}) {
  const organizationId = params.organization;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Track revenue, subscriptions, and customer metrics
        </p>
      </div>
      <AnalyticsPage organizationId={organizationId} />
    </div>
  );
}
```

##### Step 3: Create Main Analytics Component
```typescript
// apps/web/src/components/Analytics/AnalyticsPage.tsx
'use client';

import { useState } from 'react';
import { subDays } from 'date-fns';
import { useAnalytics } from '@/hooks/queries/analytics';
import { MetricsOverview } from './MetricsOverview';
import { RevenueChart } from './RevenueChart';
import { SubscriptionGrowthChart } from './SubscriptionGrowthChart';
import { AnalyticsFilters } from './AnalyticsFilters';

export function AnalyticsPage({ organizationId }: { organizationId: string }) {
  const [dateRange, setDateRange] = useState({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const { data, isLoading } = useAnalytics(organizationId, dateRange);

  if (isLoading) return <AnalyticsSkeleton />;

  return (
    <div className="space-y-6">
      <AnalyticsFilters dateRange={dateRange} onDateRangeChange={setDateRange} />

      <MetricsOverview metrics={data?.metrics} />

      <div className="grid gap-6 md:grid-cols-2">
        <RevenueChart data={data?.revenueTrend} />
        <SubscriptionGrowthChart data={data?.subscriptionGrowth} />
      </div>
    </div>
  );
}
```

##### Step 4: Create Metrics Overview Component
```typescript
// apps/web/src/components/Analytics/MetricsOverview.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, XCircle, DollarSign } from 'lucide-react';

type Metrics = {
  mrr: number;
  mrrChange: number; // percentage
  activeSubscriptions: number;
  subscriptionsChange: number;
  churnRate: number;
  churnChange: number;
  totalRevenue: number;
  revenueChange: number;
};

export function MetricsOverview({ metrics }: { metrics?: Metrics }) {
  if (!metrics) return null;

  const cards = [
    {
      title: 'Monthly Recurring Revenue',
      value: `$${(metrics.mrr / 100).toLocaleString()}`,
      change: metrics.mrrChange,
      icon: DollarSign,
    },
    {
      title: 'Active Subscriptions',
      value: metrics.activeSubscriptions.toString(),
      change: metrics.subscriptionsChange,
      icon: Users,
    },
    {
      title: 'Churn Rate',
      value: `${metrics.churnRate.toFixed(1)}%`,
      change: metrics.churnChange,
      icon: XCircle,
      invertColors: true, // Lower is better
    },
    {
      title: 'Total Revenue',
      value: `$${(metrics.totalRevenue / 100).toLocaleString()}`,
      change: metrics.revenueChange,
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className={`text-xs ${
              card.invertColors
                ? card.change > 0 ? 'text-destructive' : 'text-green-600'
                : card.change > 0 ? 'text-green-600' : 'text-destructive'
            }`}>
              {card.change > 0 ? '+' : ''}{card.change.toFixed(1)}% from last period
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

##### Step 5: Create Revenue Chart
```typescript
// apps/web/src/components/Analytics/RevenueChart.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

type DataPoint = {
  date: string;
  revenue: number;
};

export function RevenueChart({ data }: { data?: DataPoint[] }) {
  if (!data || data.length === 0) return null;

  const chartData = data.map((point) => ({
    date: format(new Date(point.date), 'MMM d'),
    revenue: point.revenue / 100, // Convert cents to dollars
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-muted-foreground">Revenue:</span>
                        <span className="font-bold">${payload[0].value}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

##### Step 6: Create Subscription Growth Chart (Similar Pattern)

##### Step 7: Create Date Range Filter
```typescript
// apps/web/src/components/Analytics/AnalyticsFilters.tsx
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

type DateRange = {
  from: Date;
  to: Date;
};

export function AnalyticsFilters({ dateRange, onDateRangeChange }: {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(dateRange.from, 'MMM d, yyyy')} - {format(dateRange.to, 'MMM d, yyyy')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={{ from: dateRange.from, to: dateRange.to }}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                onDateRangeChange({ from: range.from, to: range.to });
              }
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Quick filters */}
      <Button variant="outline" onClick={() => onDateRangeChange({ from: subDays(new Date(), 7), to: new Date() })}>
        Last 7 days
      </Button>
      <Button variant="outline" onClick={() => onDateRangeChange({ from: subDays(new Date(), 30), to: new Date() })}>
        Last 30 days
      </Button>
      <Button variant="outline" onClick={() => onDateRangeChange({ from: subDays(new Date(), 90), to: new Date() })}>
        Last 90 days
      </Button>
    </div>
  );
}
```

#### Files to Create
- `apps/web/src/app/dashboard/[organization]/analytics/page.tsx`
- `apps/web/src/components/Analytics/AnalyticsPage.tsx`
- `apps/web/src/components/Analytics/MetricsOverview.tsx`
- `apps/web/src/components/Analytics/RevenueChart.tsx`
- `apps/web/src/components/Analytics/SubscriptionGrowthChart.tsx`
- `apps/web/src/components/Analytics/AnalyticsFilters.tsx`
- `apps/web/src/components/Analytics/AnalyticsSkeleton.tsx`

#### Testing Checklist
- [ ] All metrics display correctly
- [ ] Charts render properly
- [ ] Date range filter updates data
- [ ] Quick filters (7d, 30d, 90d) work
- [ ] Responsive layout on mobile
- [ ] Loading states show while fetching
- [ ] Empty states for no data
- [ ] Tooltip shows correct values

---

### Task 7: Create Analytics Query Hooks ⭐ HIGH PRIORITY
**Estimated Time:** 3-4 hours (Day 7)
**Dependencies:** Ankush's Analytics API ready (Day 3)

#### Implementation
```typescript
// apps/web/src/hooks/queries/analytics.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { format } from 'date-fns';

type DateRange = {
  from: Date;
  to: Date;
};

type AnalyticsData = {
  metrics: {
    mrr: number;
    mrrChange: number;
    activeSubscriptions: number;
    subscriptionsChange: number;
    churnRate: number;
    churnChange: number;
    totalRevenue: number;
    revenueChange: number;
  };
  revenueTrend: Array<{ date: string; revenue: number }>;
  subscriptionGrowth: Array<{ date: string; active: number; new: number; churned: number }>;
};

// Query Keys
export const analyticsKeys = {
  all: ['analytics'] as const,
  overview: (orgId: string, range: DateRange) =>
    [...analyticsKeys.all, 'overview', orgId, format(range.from, 'yyyy-MM-dd'), format(range.to, 'yyyy-MM-dd')] as const,
  mrr: (orgId: string) => [...analyticsKeys.all, 'mrr', orgId] as const,
  churn: (orgId: string, period: string) => [...analyticsKeys.all, 'churn', orgId, period] as const,
};

// Main Hook
export function useAnalytics(organizationId: string, dateRange: DateRange) {
  return useQuery({
    queryKey: analyticsKeys.overview(organizationId, dateRange),
    queryFn: async () => {
      const params = new URLSearchParams({
        from: format(dateRange.from, 'yyyy-MM-dd'),
        to: format(dateRange.to, 'yyyy-MM-dd'),
      });

      // Fetch all analytics data in parallel
      const [metrics, revenueTrend, subscriptionGrowth] = await Promise.all([
        apiClient.get<AnalyticsData['metrics']>(`/analytics/overview?${params}`),
        apiClient.get<AnalyticsData['revenueTrend']>(`/analytics/revenue/trend?${params}`),
        apiClient.get<AnalyticsData['subscriptionGrowth']>(`/analytics/subscriptions/growth?${params}`),
      ]);

      return {
        metrics,
        revenueTrend,
        subscriptionGrowth,
      };
    },
    staleTime: 60000, // 1 minute (analytics don't need real-time updates)
  });
}

export function useMRR(organizationId: string) {
  return useQuery({
    queryKey: analyticsKeys.mrr(organizationId),
    queryFn: async () => {
      return apiClient.get<{ mrr: number; change: number }>(`/analytics/mrr`);
    },
    staleTime: 300000, // 5 minutes
  });
}

export function useChurnRate(organizationId: string, period: 'month' | 'quarter' | 'year' = 'month') {
  return useQuery({
    queryKey: analyticsKeys.churn(organizationId, period),
    queryFn: async () => {
      return apiClient.get<{ churnRate: number; change: number }>(`/analytics/churn-rate?period=${period}`);
    },
    staleTime: 300000, // 5 minutes
  });
}
```

#### Files to Create
- `apps/web/src/hooks/queries/analytics.ts`

#### Update Export
```typescript
// apps/web/src/hooks/queries/index.ts
export * from './analytics';
```

#### Testing Checklist
- [ ] useAnalytics fetches all data
- [ ] Date range filter triggers refetch
- [ ] Data formats correctly for charts
- [ ] Cache works (doesn't refetch on remount)
- [ ] Error states handled

---

## Daily Checklist

### Every Morning
- [ ] Pull latest changes
- [ ] Check for API availability from Ankush
- [ ] Update progress document
- [ ] Review design consistency with Polar

### Every Evening
- [ ] Commit and push work
- [ ] Update `docs/sprint-beta-launch/aakash-progress.md`
- [ ] Screenshot progress for documentation
- [ ] Note blockers for standup

### Handoff Points
- **Day 2:** Wait for Ankush's Customers API → Start Task 2 & 3
- **Day 3:** Wait for Ankush's Analytics API → Start Task 6 & 7
- **Week 2 End:** Notify team analytics dashboard is ready for testing

---

**Created:** January 22, 2026
**Assigned To:** Aakash
**Estimated Total Hours:** 40-52 hours
**Status:** Ready to Start
