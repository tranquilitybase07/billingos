'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { MiniMetricChartBox } from '@/components/Metrics/MiniMetricChartBox'
import { OrderStatus } from '@/components/Orders/OrderStatus'
import {
  DataTable,
  DataTableColumnHeader,
} from '@/components/atoms/datatable'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/utils/metrics'
import { Download as DownloadOutlined } from '@mui/icons-material'
import Link from 'next/link'
import { useState } from 'react'

// ── Mock Data ──────────────────────────────────────────────
// TODO: Replace with real useOrders and useProducts hooks

const MOCK_PRODUCTS = [
  { id: 'prod_1', name: 'Pro Plan' },
  { id: 'prod_2', name: 'Starter Plan' },
  { id: 'prod_3', name: 'Enterprise Plan' },
  { id: 'prod_4', name: 'Lifetime Access' },
]

const MOCK_ORDERS = [
  {
    id: 'ord_1',
    customer: { id: 'cust_1', name: 'Sarah Chen', email: 'sarah@example.com' },
    product: { id: 'prod_1', name: 'Pro Plan', is_archived: false },
    net_amount: 9900,
    currency: 'usd',
    status: 'paid',
    invoice_number: 'INV-2026-001',
    created_at: '2026-01-28T08:30:00Z',
  },
  {
    id: 'ord_2',
    customer: { id: 'cust_2', name: 'James Wilson', email: 'james@acme.co' },
    product: { id: 'prod_1', name: 'Pro Plan', is_archived: false },
    net_amount: 9900,
    currency: 'usd',
    status: 'paid',
    invoice_number: 'INV-2026-002',
    created_at: '2026-01-27T14:15:00Z',
  },
  {
    id: 'ord_3',
    customer: { id: 'cust_3', name: 'Maria Garcia', email: 'maria@startup.io' },
    product: { id: 'prod_2', name: 'Starter Plan', is_archived: false },
    net_amount: 4900,
    currency: 'usd',
    status: 'paid',
    invoice_number: 'INV-2026-003',
    created_at: '2026-01-26T10:00:00Z',
  },
  {
    id: 'ord_4',
    customer: { id: 'cust_4', name: 'Alex Johnson', email: 'alex@bigcorp.com' },
    product: { id: 'prod_3', name: 'Enterprise Plan', is_archived: false },
    net_amount: 29900,
    currency: 'usd',
    status: 'paid',
    invoice_number: 'INV-2026-004',
    created_at: '2026-01-25T16:45:00Z',
  },
  {
    id: 'ord_5',
    customer: { id: 'cust_5', name: 'Emily Brown', email: 'emily@design.co' },
    product: { id: 'prod_4', name: 'Lifetime Access', is_archived: false },
    net_amount: 19900,
    currency: 'usd',
    status: 'paid',
    invoice_number: 'INV-2026-005',
    created_at: '2026-01-24T11:00:00Z',
  },
  {
    id: 'ord_6',
    customer: { id: 'cust_6', name: 'David Kim', email: 'david@tech.io' },
    product: { id: 'prod_1', name: 'Pro Plan', is_archived: false },
    net_amount: 9900,
    currency: 'usd',
    status: 'pending',
    invoice_number: 'INV-2026-006',
    created_at: '2026-01-23T09:15:00Z',
  },
  {
    id: 'ord_7',
    customer: { id: 'cust_7', name: 'Lisa Wang', email: 'lisa@creative.co' },
    product: { id: 'prod_2', name: 'Starter Plan', is_archived: false },
    net_amount: 4900,
    currency: 'usd',
    status: 'refunded',
    invoice_number: 'INV-2026-007',
    created_at: '2026-01-22T16:30:00Z',
  },
  {
    id: 'ord_8',
    customer: { id: 'cust_8', name: 'Tom Brown', email: 'tom@agency.com' },
    product: { id: 'prod_3', name: 'Enterprise Plan', is_archived: false },
    net_amount: 29900,
    currency: 'usd',
    status: 'paid',
    invoice_number: 'INV-2026-008',
    created_at: '2026-01-21T13:20:00Z',
  },
  {
    id: 'ord_9',
    customer: { id: 'cust_9', name: 'Nina Patel', email: 'nina@saas.io' },
    product: { id: 'prod_1', name: 'Pro Plan', is_archived: false },
    net_amount: 9900,
    currency: 'usd',
    status: 'paid',
    invoice_number: 'INV-2026-009',
    created_at: '2026-01-20T08:45:00Z',
  },
  {
    id: 'ord_10',
    customer: { id: 'cust_10', name: 'Ryan Cooper', email: 'ryan@dev.co' },
    product: { id: 'prod_2', name: 'Starter Plan', is_archived: false },
    net_amount: 4900,
    currency: 'usd',
    status: 'failed',
    invoice_number: 'INV-2026-010',
    created_at: '2026-01-19T15:10:00Z',
  },
]

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ── Component ──────────────────────────────────────────────

interface OrdersPageProps {
  organizationId: string
  organizationSlug: string
  productIdFilter?: string
}

export default function OrdersPage({
  organizationSlug,
  productIdFilter,
}: OrdersPageProps) {
  // If the product_id from the URL doesn't match any mock product, ignore it
  const validProductFilter =
    productIdFilter && MOCK_PRODUCTS.some((p) => p.id === productIdFilter)
      ? productIdFilter
      : 'all'

  const [selectedProduct, setSelectedProduct] = useState<string>(validProductFilter)

  const filteredOrders =
    selectedProduct === 'all'
      ? MOCK_ORDERS
      : MOCK_ORDERS.filter((o) => o.product.id === selectedProduct)

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-8">
        {/* Filters & Actions */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {MOCK_PRODUCTS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="secondary" size="sm" className="gap-x-2">
            <DownloadOutlined className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <MiniMetricChartBox
            title="Orders"
            value={filteredOrders.length}
            type="scalar"
          />
          <MiniMetricChartBox
            title="Today's Revenue"
            value={9900}
            type="currency"
          />
          <MiniMetricChartBox
            title="Cumulative Revenue"
            value={
              filteredOrders
                .filter((o) => o.status === 'paid')
                .reduce((sum, o) => sum + o.net_amount, 0)
            }
            type="currency"
          />
        </div>

        {/* Orders Table */}
        <DataTable
          data={filteredOrders}
          columns={[
            {
              id: 'customer',
              accessorKey: 'customer',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Customer" />
              ),
              cell: ({ row: { original: order } }) => (
                <div className="flex flex-row items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {order.customer.name.charAt(0)}
                  </div>
                  <div className="truncate text-sm">
                    {order.customer.email}
                  </div>
                </div>
              ),
            },
            {
              accessorKey: 'net_amount',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Amount" />
              ),
              cell: ({ row: { original: order } }) => (
                <span className="text-sm font-medium">
                  {formatCurrency(order.net_amount, order.currency)}
                </span>
              ),
            },
            {
              id: 'product',
              accessorKey: 'product',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Product" />
              ),
              cell: ({ row: { original: order } }) => (
                <div className="flex items-center gap-2">
                  <span className="text-sm">{order.product.name}</span>
                  {order.product.is_archived && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-950 dark:text-red-400">
                      Archived
                    </span>
                  )}
                </div>
              ),
            },
            {
              accessorKey: 'status',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Status" />
              ),
              cell: ({ row: { original: order } }) => (
                <OrderStatus status={order.status} />
              ),
            },
            {
              accessorKey: 'invoice_number',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Invoice" />
              ),
              cell: ({ row: { original: order } }) => (
                <span className="text-sm text-muted-foreground">
                  {order.invoice_number}
                </span>
              ),
            },
            {
              accessorKey: 'created_at',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Date" />
              ),
              cell: ({ row: { original: order } }) => (
                <span className="text-sm">
                  {formatDate(order.created_at)}
                </span>
              ),
            },
            {
              id: 'actions',
              header: () => null,
              cell: ({ row: { original: order } }) => (
                <span className="flex flex-row justify-end">
                  <Link
                    href={`/dashboard/${organizationSlug}/sales/${order.id}`}
                  >
                    <Button variant="secondary" size="sm">
                      View
                    </Button>
                  </Link>
                </span>
              ),
            },
          ]}
          isLoading={false}
        />
      </div>
    </DashboardBody>
  )
}
