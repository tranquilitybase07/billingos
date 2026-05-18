'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { PlusSignIcon } from 'hugeicons-react'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { useDebounce } from '@/hooks/use-debounce'
import { useProducts } from '@/hooks/queries/products'
import {
  DataTable,
  DataTableColumnDef,
  DataTableColumnHeader,
} from '@/components/atoms/datatable'
import { PillTabs, PillTabsList, PillTabsTrigger } from '@/components/atoms/PillTabs'
import { SearchInput } from '@/components/atoms/SearchInput'
import { TableEmptyState } from '@/components/atoms/TableEmptyState'
import {
  ProductActionsCell,
  ProductVisibilityCell,
} from '@/components/Products/ProductTableCells'
import ProductPriceLabel from '@/components/Products/ProductPriceLabel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DataTablePaginationState,
  DataTableSortingState,
  serializeSearchParams,
  sortingStateToQueryParam,
} from '@/utils/datatable'
import { isMeteredPrice, isSeatBasedPrice, type Product } from '@/utils/product'

type ShowTab = 'Active' | 'Archived' | 'All'

const SHOW_TABS: ShowTab[] = ['Active', 'Archived', 'All']

const TAB_TO_API: Record<ShowTab, boolean | null> = {
  Active: false,
  Archived: true,
  All: null,
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getPricingModel(product: Product): {
  label: string
  className: string
} {
  if (product.prices.some((p) => p.amount_type === 'free')) {
    return {
      label: 'Free',
      className:
        'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
    }
  }
  if (product.prices.some(isMeteredPrice)) {
    return {
      label: 'Metered',
      className:
        'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    }
  }
  if (product.prices.some(isSeatBasedPrice)) {
    return {
      label: 'Seat',
      className:
        'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
    }
  }
  if (product.is_recurring || product.recurring_interval) {
    return { label: 'Recurring', className: '' }
  }
  return { label: 'One-time', className: '' }
}

export default function ClientPage({
  organizationId,
  organizationSlug,
  pagination,
  sorting,
  query: _query,
}: {
  organizationId: string
  organizationSlug: string
  pagination: DataTablePaginationState
  sorting: DataTableSortingState
  query: string | undefined
}) {
  const [query, setQuery] = useState(_query || '')
  const debouncedQuery = useDebounce(query, 300)
  const [showTab, setShowTab] = useState<ShowTab>('Active')

  const router = useRouter()
  const pathname = usePathname()

  const updateUrl = useCallback(
    (nextPagination: DataTablePaginationState, nextSorting: DataTableSortingState, nextQuery: string) => {
      const searchParams = serializeSearchParams(nextPagination, nextSorting)
      if (nextQuery) searchParams.set('query', nextQuery)
      else searchParams.delete('query')
      router.replace(`${pathname}?${searchParams}`)
    },
    [router, pathname],
  )

  const onSortingChange: React.ComponentProps<typeof DataTable>['onSortingChange'] = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    updateUrl({ ...pagination, pageIndex: 0 }, next, debouncedQuery)
  }

  const onPaginationChange: React.ComponentProps<typeof DataTable>['onPaginationChange'] = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater
    updateUrl(next, sorting, debouncedQuery)
  }

  const onQueryChange = (next: string) => {
    setQuery(next)
  }

  const lastSyncedQuery = useRef(_query || '')
  useEffect(() => {
    if (lastSyncedQuery.current === debouncedQuery) return
    lastSyncedQuery.current = debouncedQuery
    updateUrl({ ...pagination, pageIndex: 0 }, sorting, debouncedQuery)
  }, [debouncedQuery, pagination, sorting, updateUrl])

  const products = useProducts(organizationId, {
    query: debouncedQuery,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    sorting: sortingStateToQueryParam(sorting),
    is_archived: TAB_TO_API[showTab],
  })

  const items = products.data?.items ?? []
  const totalCount = products.data?.pagination.total_count ?? 0
  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize))

  const columns: DataTableColumnDef<Product>[] = useMemo(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row: { original: p } }) => (
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
            {p.version && p.version > 1 && (
              <Badge variant="outline" className="text-[10px] font-normal py-0">
                v{p.version}
              </Badge>
            )}
            {p.version_status === 'superseded' && (
              <Badge variant="secondary" className="text-[10px] font-normal py-0">
                Old Version
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: 'pricing_model',
        header: () => (
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Pricing Model
          </span>
        ),
        cell: ({ row: { original: p } }) => {
          const model = getPricingModel(p)
          return (
            <Badge
              variant="secondary"
              className={`text-[10px] font-normal py-0 ${model.className}`}
            >
              {model.label}
            </Badge>
          )
        },
        enableSorting: false,
      },
      {
        id: 'price',
        accessorKey: 'price_amount',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
        cell: ({ row: { original: p } }) => {
          const priceCount = p.prices.length
          return (
            <div className="flex items-center gap-1.5 text-sm">
              <ProductPriceLabel product={p} />
              {priceCount > 1 && (
                <span className="text-xs text-muted-foreground">
                  +{priceCount - 1} more
                </span>
              )}
            </div>
          )
        },
      },
      {
        id: 'status',
        header: () => (
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Status
          </span>
        ),
        cell: ({ row: { original: p } }) => {
          if (p.is_archived) {
            return <Badge variant="destructive" className="text-[10px] font-normal py-0">Archived</Badge>
          }
          if (p.version_status === 'superseded') {
            return <Badge variant="secondary" className="text-[10px] font-normal py-0">Superseded</Badge>
          }
          return (
            <Badge
              variant="secondary"
              className="text-[10px] font-normal py-0 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
            >
              Active
            </Badge>
          )
        },
        enableSorting: false,
      },
      {
        id: 'visible',
        header: () => (
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Visible
          </span>
        ),
        cell: ({ row: { original: p } }) => <ProductVisibilityCell product={p} />,
        enableSorting: false,
        size: 80,
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        cell: ({ row: { original: p } }) => (
          <span className="text-sm text-muted-foreground">{formatDate(p.created_at)}</span>
        ),
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row: { original: p } }) => (
          <div className="flex justify-end">
            <ProductActionsCell product={p} organizationSlug={organizationSlug} />
          </div>
        ),
        enableSorting: false,
        size: 60,
      },
    ],
    [organizationSlug],
  )

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Products</h1>
            <p className="text-muted-foreground">Manage your product catalog and pricing</p>
          </div>
          <Link href={`/dashboard/${organizationSlug}/products/new`}>
            <Button className="gap-x-2">
              <PlusSignIcon size={16} />
              <span>New Product</span>
            </Button>
          </Link>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <PillTabs
              layoutId="products-show-indicator"
              value={showTab}
              onValueChange={(v) => setShowTab(v as ShowTab)}
            >
              <PillTabsList>
                {SHOW_TABS.map((tab) => (
                  <PillTabsTrigger key={tab} value={tab}>
                    {tab}
                  </PillTabsTrigger>
                ))}
              </PillTabsList>
            </PillTabs>

            <SearchInput
              value={query}
              onValueChange={onQueryChange}
              placeholder="Search products..."
            />
          </div>
        </div>

        {/* Table */}
        <DataTable
          data={items}
          columns={columns}
          isLoading={products.isLoading}
          sorting={sorting}
          onSortingChange={onSortingChange}
          pagination={pagination}
          onPaginationChange={onPaginationChange}
          pageCount={pageCount}
          rowCount={totalCount}
          getRowId={(row) => row.id}
          onRowClick={(row) => {
            router.push(`/dashboard/${organizationSlug}/products/${row.original.id}`)
          }}
          className="[&_tr]:cursor-pointer"
          emptyState={
            <TableEmptyState
              title="No products found"
              description={
                debouncedQuery || showTab !== 'Active'
                  ? 'No products match your current filters.'
                  : 'Start selling digital products today.'
              }
              action={{
                label: 'Create Product',
                onClick: () => router.push(`/dashboard/${organizationSlug}/products/new`),
                icon: <PlusSignIcon size={14} />,
              }}
            />
          }
        />
      </div>
    </DashboardBody>
  )
}
