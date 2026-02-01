# Abdul - Subscriptions UI + Polish Tasks

**Role:** Frontend Developer (Subscriptions + QA)
**Sprint Duration:** 2-3 weeks
**Total Tasks:** 6

## Week 1: Subscriptions Management (Days 1-5)

### Task 1: Study Polar's Subscriptions Page ⭐ RESEARCH
**Estimated Time:** 4-6 hours (Day 1)
**Dependencies:** None
**Deliverable:** Documentation of Polar's subscriptions patterns

#### Description
Deep dive into Polar's subscriptions implementation to understand table structure, status badges, and subscription actions.

#### Research Steps
1. **Navigate to Polar Repository**
   - Location: `/Users/ankushkumar/Code/payment/billingos` (Polar repo)
   - Focus: Subscriptions pages, subscription management components

2. **Find Subscriptions-Related Files**
   ```bash
   cd /Users/ankushkumar/Code/payment/billingos
   find . -name "*subscription*" -type f | grep -E "\.(tsx|ts)$"
   ```

3. **Document Key Findings** (`docs/sprint-beta-launch/polar-subscriptions-analysis.md`)
   - **Table Structure:**
     - Columns displayed (customer, plan, status, billing date, MRR, etc.)
     - Sorting and filtering options
     - Status badge variants (active, cancelled, past_due, trialing)

   - **Subscription Actions:**
     - Cancel subscription flow
     - Upgrade/downgrade modal
     - Pause/resume functionality
     - Change payment method
     - View invoice history

   - **Detail View:**
     - Full subscription information
     - Billing history
     - Feature access list
     - Usage metrics (if applicable)

   - **Components to Copy:**
     - SubscriptionsTable
     - SubscriptionRow
     - SubscriptionStatusBadge
     - SubscriptionActions dropdown
     - CancelSubscriptionDialog
     - UpgradeDowngradeModal

4. **Create Component Inventory**
   ```markdown
   ## Subscriptions Components to Build
   1. SubscriptionsPage.tsx - Main page wrapper
   2. SubscriptionsDataTable.tsx - Table with subscriptions
   3. SubscriptionStatusBadge.tsx - Status indicator
   4. SubscriptionActions.tsx - Action dropdown
   5. SubscriptionDetailSheet.tsx - Detail drawer
   6. CancelSubscriptionDialog.tsx - Cancellation flow
   7. SubscriptionFilters.tsx - Filter controls
   ```

5. **Take Screenshots**
   - Capture Polar's subscriptions table
   - Document layout and spacing
   - Note responsive behavior

#### Deliverables
- `docs/sprint-beta-launch/polar-subscriptions-analysis.md`
- Component list with Polar references
- UI screenshots or wireframes
- Status badge color scheme

---

### Task 2: Create Subscriptions Page ⭐ CRITICAL - HIGH PRIORITY
**Estimated Time:** 8-12 hours (Days 2-3)
**Dependencies:** Task 1 complete, Ankush's Subscriptions API working
**Priority:** HIGHEST - This is your #1 priority

#### Description
Build the subscriptions management page that shows all active subscriptions for the organization.

#### Implementation Steps

##### Step 1: Create Page Structure
```typescript
// apps/web/src/app/dashboard/[organization]/subscriptions/page.tsx
import { SubscriptionsPage } from '@/components/Subscriptions/SubscriptionsPage';

export default async function SubscriptionsPageRoute({
  params,
}: {
  params: { organization: string };
}) {
  const organizationId = params.organization;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">
            Manage your customers' subscriptions and billing
          </p>
        </div>
      </div>
      <SubscriptionsPage organizationId={organizationId} />
    </div>
  );
}
```

##### Step 2: Create Main Component
```typescript
// apps/web/src/components/Subscriptions/SubscriptionsPage.tsx
'use client';

import { useState } from 'react';
import { useSubscriptions } from '@/hooks/queries/subscriptions';
import { SubscriptionsDataTable } from './SubscriptionsDataTable';
import { SubscriptionFilters, type FilterState } from './SubscriptionFilters';
import { Skeleton } from '@/components/ui/skeleton';

interface SubscriptionsPageProps {
  organizationId: string;
}

export function SubscriptionsPage({ organizationId }: SubscriptionsPageProps) {
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    plan: 'all',
    search: '',
  });

  const { data, isLoading, error } = useSubscriptions(organizationId, filters);

  if (isLoading) return <SubscriptionsPageSkeleton />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-4">
      <SubscriptionFilters filters={filters} onFiltersChange={setFilters} />
      <SubscriptionsDataTable data={data?.subscriptions ?? []} />
    </div>
  );
}

function SubscriptionsPageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
```

##### Step 3: Create DataTable Component
```typescript
// apps/web/src/components/Subscriptions/SubscriptionsDataTable.tsx
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
import { SubscriptionActions } from './SubscriptionActions';
import { SubscriptionStatusBadge } from './SubscriptionStatusBadge';
import { format } from 'date-fns';

type Subscription = {
  id: string;
  customer: {
    id: string;
    name: string;
    email: string;
  };
  product: {
    id: string;
    name: string;
  };
  price: {
    id: string;
    amount: number;
    interval: 'month' | 'year';
  };
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
};

export const columns: ColumnDef<Subscription>[] = [
  {
    accessorKey: 'customer',
    header: 'Customer',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.customer.name}</div>
        <div className="text-sm text-muted-foreground">{row.original.customer.email}</div>
      </div>
    ),
  },
  {
    accessorKey: 'product',
    header: 'Plan',
    cell: ({ row }) => {
      const { product, price } = row.original;
      return (
        <div>
          <div className="font-medium">{product.name}</div>
          <div className="text-sm text-muted-foreground">
            ${(price.amount / 100).toFixed(2)}/{price.interval}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <SubscriptionStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'currentPeriodEnd',
    header: 'Next Billing',
    cell: ({ row }) => {
      const date = new Date(row.original.currentPeriodEnd);
      return (
        <div>
          <div className="text-sm">{format(date, 'MMM d, yyyy')}</div>
          {row.original.cancelAtPeriodEnd && (
            <div className="text-xs text-destructive">Cancels at period end</div>
          )}
        </div>
      );
    },
  },
  {
    header: 'MRR',
    cell: ({ row }) => {
      const { price } = row.original;
      const mrr = price.interval === 'year' ? price.amount / 12 : price.amount;
      return (
        <div className="font-medium">
          ${(mrr / 100).toFixed(2)}
        </div>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <SubscriptionActions subscription={row.original} />,
  },
];

export function SubscriptionsDataTable({ data }: { data: Subscription[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <>
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
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    setSelectedSubscriptionId(row.original.id);
                    setDetailSheetOpen(true);
                  }}
                >
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
                  No subscriptions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail Sheet - created in Task 4 */}
      {selectedSubscriptionId && (
        <SubscriptionDetailSheet
          subscriptionId={selectedSubscriptionId}
          open={detailSheetOpen}
          onOpenChange={setDetailSheetOpen}
        />
      )}
    </>
  );
}
```

##### Step 4: Create Status Badge Component
```typescript
// apps/web/src/components/Subscriptions/SubscriptionStatusBadge.tsx
import { Badge } from '@/components/ui/badge';

type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing';

const statusConfig: Record<SubscriptionStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  trialing: { label: 'Trialing', variant: 'outline' },
  past_due: { label: 'Past Due', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

##### Step 5: Create Filters Component
```typescript
// apps/web/src/components/Subscriptions/SubscriptionFilters.tsx
'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type FilterState = {
  status: 'all' | 'active' | 'cancelled' | 'past_due' | 'trialing';
  plan: string;
  search: string;
};

interface SubscriptionFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

export function SubscriptionFilters({ filters, onFiltersChange }: SubscriptionFiltersProps) {
  return (
    <div className="flex items-center gap-4">
      <Input
        placeholder="Search by customer..."
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
          <SelectItem value="trialing">Trialing</SelectItem>
          <SelectItem value="past_due">Past Due</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.plan}
        onValueChange={(value) => onFiltersChange({ ...filters, plan: value })}
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

##### Step 6: Create Actions Component
```typescript
// apps/web/src/components/Subscriptions/SubscriptionActions.tsx
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Eye, Pause, Play, Ban, CreditCard, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { CancelSubscriptionDialog } from './CancelSubscriptionDialog';

export function SubscriptionActions({ subscription }: { subscription: any }) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); /* View details */ }}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>

          {subscription.status === 'active' && (
            <>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); /* Upgrade/downgrade */ }}>
                <TrendingUp className="mr-2 h-4 w-4" />
                Change Plan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); /* Update payment */ }}>
                <CreditCard className="mr-2 h-4 w-4" />
                Update Payment Method
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          {subscription.status === 'active' && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setCancelDialogOpen(true);
              }}
              className="text-destructive"
            >
              <Ban className="mr-2 h-4 w-4" />
              Cancel Subscription
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CancelSubscriptionDialog
        subscription={subscription}
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
      />
    </>
  );
}
```

#### Files to Create
- `apps/web/src/app/dashboard/[organization]/subscriptions/page.tsx`
- `apps/web/src/components/Subscriptions/SubscriptionsPage.tsx`
- `apps/web/src/components/Subscriptions/SubscriptionsDataTable.tsx`
- `apps/web/src/components/Subscriptions/SubscriptionStatusBadge.tsx`
- `apps/web/src/components/Subscriptions/SubscriptionFilters.tsx`
- `apps/web/src/components/Subscriptions/SubscriptionActions.tsx`

#### Testing Checklist
- [ ] Page displays all subscriptions
- [ ] Status badges show correct colors
- [ ] Search filter works
- [ ] Status filter updates table
- [ ] Plan filter works
- [ ] Sorting by columns works
- [ ] MRR calculated correctly
- [ ] Next billing date shows correctly
- [ ] Cancel warning displays for ending subscriptions
- [ ] Loading states work
- [ ] Empty state shows when no subscriptions

---

### Task 3: Create Subscriptions Query Hooks ⭐ HIGH PRIORITY
**Estimated Time:** 3-4 hours (Day 2)
**Dependencies:** Ankush's Subscriptions API working
**Blocks:** Task 2 (SubscriptionsPage needs these hooks)

#### Description
Build React Query hooks for subscriptions operations.

#### Implementation
```typescript
// apps/web/src/hooks/queries/subscriptions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

// Types
export type Subscription = {
  id: string;
  customerId: string;
  customer: {
    id: string;
    name: string;
    email: string;
  };
  productId: string;
  product: {
    id: string;
    name: string;
  };
  priceId: string;
  price: {
    id: string;
    amount: number;
    interval: 'month' | 'year';
  };
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionsListResponse = {
  subscriptions: Subscription[];
  total: number;
};

export type SubscriptionFilters = {
  status?: string;
  plan?: string;
  search?: string;
};

// Query Keys
export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  lists: () => [...subscriptionKeys.all, 'list'] as const,
  list: (orgId: string, filters: SubscriptionFilters) =>
    [...subscriptionKeys.lists(), orgId, filters] as const,
  details: () => [...subscriptionKeys.all, 'detail'] as const,
  detail: (id: string) => [...subscriptionKeys.details(), id] as const,
};

// Hooks
export function useSubscriptions(organizationId: string, filters: SubscriptionFilters = {}) {
  return useQuery({
    queryKey: subscriptionKeys.list(organizationId, filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== 'all') params.append('status', filters.status);
      if (filters.plan && filters.plan !== 'all') params.append('plan', filters.plan);
      if (filters.search) params.append('search', filters.search);

      const response = await apiClient.get<SubscriptionsListResponse>(
        `/subscriptions?${params.toString()}`
      );
      return response;
    },
    staleTime: 30000, // 30 seconds
  });
}

export function useSubscription(subscriptionId: string) {
  return useQuery({
    queryKey: subscriptionKeys.detail(subscriptionId),
    queryFn: async () => {
      const response = await apiClient.get<Subscription>(`/subscriptions/${subscriptionId}`);
      return response;
    },
    enabled: !!subscriptionId,
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      customerId: string;
      priceId: string;
      trialPeriodDays?: number;
    }) => {
      return apiClient.post<Subscription>('/subscriptions', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() });
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      return apiClient.post<Subscription>(`/subscriptions/${subscriptionId}/cancel`, {});
    },
    onSuccess: (_, subscriptionId) => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.detail(subscriptionId) });
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() });
    },
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { priceId?: string } }) => {
      return apiClient.patch<Subscription>(`/subscriptions/${id}`, data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() });
    },
  });
}
```

#### Update Index File
```typescript
// apps/web/src/hooks/queries/index.ts
export * from './subscriptions';
// ... other exports
```

#### Files to Create
- `apps/web/src/hooks/queries/subscriptions.ts`

#### Testing Checklist
- [ ] useSubscriptions fetches data correctly
- [ ] Filters work properly
- [ ] useSubscription fetches single subscription
- [ ] useCancelSubscription mutation works
- [ ] useUpdateSubscription mutation works
- [ ] Cache invalidation works
- [ ] Loading and error states handled

---

### Task 4: Subscription Detail Page/Modal
**Estimated Time:** 4-6 hours (Day 4)
**Dependencies:** Tasks 2 & 3 complete

#### Description
Build detailed view for individual subscription with billing history and quick actions.

#### Implementation
```typescript
// apps/web/src/components/Subscriptions/SubscriptionDetailSheet.tsx
'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useSubscription } from '@/hooks/queries/subscriptions';
import { SubscriptionStatusBadge } from './SubscriptionStatusBadge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { useState } from 'react';
import { CancelSubscriptionDialog } from './CancelSubscriptionDialog';

interface SubscriptionDetailSheetProps {
  subscriptionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscriptionDetailSheet({ subscriptionId, open, onOpenChange }: SubscriptionDetailSheetProps) {
  const { data: subscription, isLoading } = useSubscription(subscriptionId!);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  if (!subscriptionId) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Subscription Details</SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div>Loading...</div>
          ) : subscription ? (
            <div className="mt-6 space-y-6">
              {/* Subscription Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium">Customer</div>
                      <div className="text-sm text-muted-foreground">{subscription.customer.name}</div>
                      <div className="text-xs text-muted-foreground">{subscription.customer.email}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Status</div>
                      <SubscriptionStatusBadge status={subscription.status} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium">Plan</div>
                      <div className="text-sm text-muted-foreground">{subscription.product.name}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Price</div>
                      <div className="text-sm font-semibold">
                        ${(subscription.price.amount / 100).toFixed(2)}/{subscription.price.interval}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium">Current Period</div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(subscription.currentPeriodStart), 'MMM d, yyyy')} -{' '}
                        {format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Created</div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(subscription.createdAt), 'MMM d, yyyy')}
                      </div>
                    </div>
                  </div>

                  {subscription.cancelAtPeriodEnd && (
                    <div className="rounded-md bg-destructive/10 p-3">
                      <div className="text-sm font-medium text-destructive">
                        This subscription will cancel on{' '}
                        {format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tabs */}
              <Tabs defaultValue="features">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="features">Features</TabsTrigger>
                  <TabsTrigger value="billing">Billing</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="features">
                  <Card>
                    <CardHeader>
                      <CardTitle>Feature Access</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* List features granted by this subscription */}
                      <div className="text-sm text-muted-foreground">
                        Feature list will be displayed here
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="billing">
                  <Card>
                    <CardHeader>
                      <CardTitle>Billing History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* List past invoices */}
                      <div className="text-sm text-muted-foreground">
                        Invoice history will be displayed here
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="history">
                  <Card>
                    <CardHeader>
                      <CardTitle>Activity Log</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Subscription events timeline */}
                      <div className="text-sm text-muted-foreground">
                        Activity log will be displayed here
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Actions */}
              {subscription.status === 'active' && (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">
                    Change Plan
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    Cancel Subscription
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div>Subscription not found</div>
          )}
        </SheetContent>
      </Sheet>

      {subscription && (
        <CancelSubscriptionDialog
          subscription={subscription}
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
        />
      )}
    </>
  );
}
```

#### Create Cancel Dialog
```typescript
// apps/web/src/components/Subscriptions/CancelSubscriptionDialog.tsx
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCancelSubscription } from '@/hooks/queries/subscriptions';
import { toast } from 'sonner';

interface CancelSubscriptionDialogProps {
  subscription: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CancelSubscriptionDialog({ subscription, open, onOpenChange }: CancelSubscriptionDialogProps) {
  const cancelMutation = useCancelSubscription();

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(subscription.id);
      toast.success('Subscription cancelled successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to cancel subscription');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to cancel this subscription? The customer will retain access until the end of the
            current billing period ({new Date(subscription.currentPeriodEnd).toLocaleDateString()}).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancel}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Subscription'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

#### Files to Create
- `apps/web/src/components/Subscriptions/SubscriptionDetailSheet.tsx`
- `apps/web/src/components/Subscriptions/CancelSubscriptionDialog.tsx`

#### Testing Checklist
- [ ] Sheet opens on row click
- [ ] All subscription data displays
- [ ] Tabs switch correctly
- [ ] Cancel dialog opens
- [ ] Cancel mutation works
- [ ] Success/error toasts show
- [ ] Cache updates after cancel

---

## Week 2: Feature Migration (Days 6-10)

### Task 5: Complete Feature Creation Migration ⭐ HIGH PRIORITY
**Estimated Time:** 6-8 hours (Week 2)
**Dependencies:** Current feature creation work at 70%
**Status:** In Progress (docs/feature-creation/progress.md)

#### Description
Finish the feature creation workflow migration from benefits to features page.

#### Current Status (From docs/feature-creation/progress.md)
- ✅ Phase 1: Documentation & validation (Steps 1-4)
- ✅ Phase 2: UI components (Steps 5-6)
  - CreateFeatureDialog component
  - FeatureTypeIcon component
  - Zod schema & templates
- ✅ Phase 3: Partial integration (Step 7)
  - Updated FeatureSelector
- ❌ **Step 8: Migrate Benefits → Features Page** (PENDING - YOUR TASK)
- ❌ Phase 4: Polish
- ❌ Phase 5: Testing & documentation

#### Implementation Steps for Step 8

##### Step 8.1: Rename Route
```bash
# Rename directory
mv apps/web/src/app/dashboard/[organization]/products/benefits \
   apps/web/src/app/dashboard/[organization]/products/features
```

##### Step 8.2: Create Proper Features Page
```typescript
// apps/web/src/app/dashboard/[organization]/products/features/page.tsx
import { FeaturesPage } from '@/components/Features/FeaturesPage';

export default async function FeaturesPageRoute({
  params,
}: {
  params: { organization: string };
}) {
  const organizationId = params.organization;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Features</h1>
          <p className="text-muted-foreground">
            Manage features that customers can access
          </p>
        </div>
        <CreateFeatureDialog organizationId={organizationId} />
      </div>
      <FeaturesPage organizationId={organizationId} />
    </div>
  );
}
```

##### Step 8.3: Create FeaturesPage Component
```typescript
// apps/web/src/components/Features/FeaturesPage.tsx
'use client';

import { useFeatures } from '@/hooks/queries/features';
import { FeaturesDataTable } from './FeaturesDataTable';

export function FeaturesPage({ organizationId }: { organizationId: string }) {
  const { data, isLoading } = useFeatures(organizationId);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <FeaturesDataTable data={data ?? []} />
    </div>
  );
}
```

##### Step 8.4: Create Features DataTable
```typescript
// apps/web/src/components/Features/FeaturesDataTable.tsx
'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table'; // Or create if doesn't exist
import { FeatureTypeIcon } from './FeatureTypeIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, Trash } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Feature = {
  id: string;
  name: string;
  key: string;
  type: 'boolean_flag' | 'usage_quota' | 'numeric_limit';
  description: string | null;
  quotaLimit: number | null;
  createdAt: string;
};

const columns: ColumnDef<Feature>[] = [
  {
    accessorKey: 'name',
    header: 'Feature',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <FeatureTypeIcon type={row.original.type} />
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-sm text-muted-foreground">{row.original.key}</div>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => {
      const typeLabels = {
        boolean_flag: 'On/Off',
        usage_quota: 'Usage Limit',
        numeric_limit: 'Numeric Limit',
      };
      return <Badge variant="outline">{typeLabels[row.original.type]}</Badge>;
    },
  },
  {
    accessorKey: 'quotaLimit',
    header: 'Limit',
    cell: ({ row }) => {
      const limit = row.original.quotaLimit;
      return limit ? <span>{limit.toLocaleString()}</span> : <span className="text-muted-foreground">-</span>;
    },
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.description || '-'}
      </span>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export function FeaturesDataTable({ data }: { data: Feature[] }) {
  return <DataTable columns={columns} data={data} />;
}
```

##### Step 8.5: Update Navigation Links
```typescript
// Update sidebar/navigation to point to /products/features instead of /products/benefits
// File: apps/web/src/components/layout/Sidebar.tsx or wherever nav is defined
```

#### Files to Create/Modify
- Rename: `apps/web/src/app/dashboard/[organization]/products/benefits/` → `.../features/`
- Create: `apps/web/src/components/Features/FeaturesPage.tsx`
- Create: `apps/web/src/components/Features/FeaturesDataTable.tsx`
- Modify: Navigation links in sidebar

#### Testing Checklist
- [ ] Route `/products/features` works
- [ ] Features table displays all features
- [ ] CreateFeatureDialog opens and works
- [ ] Feature types display correctly with icons
- [ ] Edit and delete actions work
- [ ] Navigation updated everywhere

---

## Week 3: UI Polish & Testing (Days 11-15)

### Task 6: UI Polish & Testing ⭐ QA LEAD
**Estimated Time:** 12-16 hours (Week 3)
**Dependencies:** All features complete
**Role:** Quality Assurance & Polish

#### Description
Comprehensive UI testing, responsive design verification, and final polish before beta launch.

#### Testing Checklist

##### 1. Mobile Responsive Testing
- [ ] **Subscriptions Page**
  - [ ] Table adapts to mobile (stacked cards or horizontal scroll)
  - [ ] Filters collapse into drawer on mobile
  - [ ] Detail sheet works on mobile
  - [ ] Actions dropdown accessible

- [ ] **Customers Page** (Aakash's work)
  - [ ] Test alongside Aakash
  - [ ] Verify mobile layout

- [ ] **Products Page** (Already built)
  - [ ] New product form responsive
  - [ ] Feature selector works on mobile

- [ ] **Analytics Dashboard** (Aakash's work)
  - [ ] Charts scale properly
  - [ ] Metrics cards stack on mobile

##### 2. Dark Mode Verification
- [ ] All new components support dark mode
- [ ] Color contrasts are accessible
- [ ] Charts readable in dark mode
- [ ] Badges and status indicators visible

##### 3. Loading States
- [ ] Skeleton loaders for all tables
- [ ] Loading spinners for mutations
- [ ] Optimistic updates where appropriate
- [ ] Disable buttons during loading

##### 4. Error Boundaries
- [ ] Error states for failed API calls
- [ ] User-friendly error messages
- [ ] Retry mechanisms where appropriate
- [ ] Fallback UI for crashed components

##### 5. Toast Notifications
- [ ] Success toasts for all mutations
- [ ] Error toasts with helpful messages
- [ ] Toast positioning consistent
- [ ] Toast duration appropriate

##### 6. Form Validation
- [ ] All forms have proper validation
- [ ] Error messages are clear
- [ ] Required fields marked
- [ ] Validation happens on blur and submit

##### 7. Accessibility (A11y)
- [ ] Keyboard navigation works
- [ ] Focus states visible
- [ ] ARIA labels on icon buttons
- [ ] Screen reader compatibility

##### 8. Performance
- [ ] Tables paginate for large datasets
- [ ] Images lazy load
- [ ] Code splitting for routes
- [ ] No unnecessary re-renders

##### 9. Cross-Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

##### 10. End-to-End Flows
- [ ] **Complete Subscription Flow**
  1. Create product
  2. Add features
  3. Create customer (via API or Stripe)
  4. Create subscription
  5. View in subscriptions table
  6. Cancel subscription
  7. Verify feature access revoked

- [ ] **Analytics Accuracy**
  1. Create multiple subscriptions
  2. Verify MRR calculation
  3. Cancel a subscription
  4. Verify churn rate updates
  5. Check revenue trend chart

#### Polish Tasks

##### UI Consistency
- [ ] Button sizes consistent across pages
- [ ] Spacing follows design system (4/8/12/16px increments)
- [ ] Typography sizes consistent
- [ ] Icon sizes uniform (typically h-4 w-4)
- [ ] Border radiuses match (rounded-md everywhere)

##### Animation & Transitions
- [ ] Sheet open/close transitions smooth
- [ ] Dialog animations consistent
- [ ] Hover states have subtle transitions
- [ ] Loading spinners smooth

##### Empty States
- [ ] All tables have empty states
- [ ] Empty states have helpful CTAs
- [ ] Empty states are visually appealing

##### Documentation
- [ ] Update `docs/sprint-beta-launch/final.md` with:
  - All implemented features
  - Known issues or limitations
  - Screenshots of major pages
  - Lessons learned

#### Bug Fix Log
- Create `docs/sprint-beta-launch/bugs-found.md` to track:
  - Bug description
  - Steps to reproduce
  - Fix applied
  - Date resolved

---

## Daily Checklist

### Every Morning
- [ ] Pull latest changes from main
- [ ] Review blockers from other team members
- [ ] Update progress in `docs/sprint-beta-launch/abdul-progress.md`
- [ ] Check Ankush's API status

### Every Evening
- [ ] Commit and push work
- [ ] Update progress document
- [ ] Take screenshots of progress
- [ ] Note any blockers for standup

### Handoff Points
- **Day 2:** Subscriptions page built → Notify Ankush for testing
- **Week 2:** Feature migration complete → Update documentation
- **Week 3:** QA complete → Notify team for final review

---

## Tools & Resources

### Reference Material
- Polar repo: `/Users/ankushkumar/Code/payment/billingos`
- Stripe subscriptions docs: https://stripe.com/docs/billing/subscriptions
- shadcn/ui components: https://ui.shadcn.com

### Testing Tools
- Browser DevTools for responsive testing
- Lighthouse for performance audit
- axe DevTools for accessibility

---

**Created:** January 22, 2026
**Assigned To:** Abdul
**Estimated Total Hours:** 37-48 hours
**Status:** Ready to Start
