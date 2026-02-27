'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import Pagination from '@/components/Pagination/Pagination'
import { ProductListItem } from '@/components/Products/ProductListItem'
import { useProducts } from '@/hooks/queries/products'
import {
  DataTablePaginationState,
  DataTableSortingState,
  serializeSearchParams,
  sortingStateToQueryParam,
} from '@/utils/datatable'
import { Add as AddOutlined, Inventory as HiveOutlined, Search } from '@mui/icons-material'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

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
  const [show, setShow] = useState('active')

  const router = useRouter()
  const pathname = usePathname()

  const onPageChange = useCallback(
    (page: number) => {
      const searchParams = serializeSearchParams(pagination, sorting)
      searchParams.set('page', page.toString())
      if (query) {
        searchParams.set('query', query)
      } else {
        searchParams.delete('query')
      }
      router.replace(`${pathname}?${searchParams}`)
    },
    [pagination, router, sorting, pathname, query],
  )

  const onLimitChange = useCallback(
    (limit: string) => {
      const searchParams = serializeSearchParams(
        { ...pagination, pageSize: parseInt(limit), pageIndex: 0 },
        sorting,
      )
      if (query) {
        searchParams.set('query', query)
      } else {
        searchParams.delete('query')
      }
      router.replace(`${pathname}?${searchParams}`)
    },
    [pagination, router, sorting, pathname, query],
  )

  const onSortingChange = useCallback(
    (value: string) => {
      const desc = value.startsWith('-')
      const id = desc ? value.slice(1) : value
      const newSorting: DataTableSortingState = [{ id, desc }]
      const searchParams = serializeSearchParams(
        { ...pagination, pageIndex: 0 },
        newSorting,
      )
      if (query) {
        searchParams.set('query', query)
      } else {
        searchParams.delete('query')
      }
      router.replace(`${pathname}?${searchParams}`)
    },
    [pagination, router, pathname, query],
  )

  const currentSortingValue =
    sorting.length > 0
      ? `${sorting[0].desc ? '-' : ''}${sorting[0].id}`
      : 'name'

  const products = useProducts(organizationId, {
    query,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    sorting: sortingStateToQueryParam(sorting),
    is_archived: show === 'all' ? null : show === 'active' ? false : true,
  })

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative w-full md:max-w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search Products"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select value={show} onValueChange={setShow}>
              <SelectTrigger className="w-full md:max-w-fit">
                <SelectValue placeholder="Show archived products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={currentSortingValue} onValueChange={onSortingChange}>
              <SelectTrigger className="w-full md:max-w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="-name">Name Z-A</SelectItem>
                <SelectItem value="-created_at">Newest</SelectItem>
                <SelectItem value="created_at">Oldest</SelectItem>
                <SelectItem value="price_amount">Price: Low to High</SelectItem>
                <SelectItem value="-price_amount">
                  Price: High to Low
                </SelectItem>
              </SelectContent>
            </Select>
            {(products.data?.pagination.total_count ?? 0) > 20 && (
              <Select
                value={pagination.pageSize.toString()}
                onValueChange={onLimitChange}
              >
                <SelectTrigger className="w-full md:max-w-fit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">Show 20</SelectItem>
                  <SelectItem value="50">Show 50</SelectItem>
                  <SelectItem value="100">Show 100</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <Link
            href={`/dashboard/${organizationSlug}/products/new`}
            className="w-full md:w-fit"
          >
            <Button className="w-full gap-x-2 md:w-fit">
              <AddOutlined className="h-4 w-4" />
              <span>New Product</span>
            </Button>
          </Link>
        </div>
        {products.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-20 w-full animate-pulse rounded-lg border bg-muted"
              />
            ))}
          </div>
        ) : products.data && products.data.items.length > 0 ? (
          <Pagination
            currentPage={pagination.pageIndex + 1}
            pageSize={pagination.pageSize}
            totalCount={products.data?.pagination.total_count || 0}
            currentURL={serializeSearchParams(pagination, sorting)}
            onPageChange={onPageChange}
          >
            <div className="flex flex-col gap-2">
              {products.data.items
                .sort((a, b) => {
                  if (a.is_archived === b.is_archived) return 0
                  return a.is_archived ? 1 : -1
                })
                .map((product) => (
                  <ProductListItem
                    key={product.id}
                    organization={{ id: organizationId, slug: organizationSlug }}
                    product={product}
                  />
                ))}
            </div>
          </Pagination>
        ) : (
          <div className="flex flex-col items-center justify-center gap-y-6 rounded-lg border bg-card py-48 shadow-sm">
            <HiveOutlined className="text-5xl text-muted-foreground/30" />
            <div className="flex flex-col items-center gap-y-6">
              <div className="flex flex-col items-center gap-y-2">
                <h3 className="text-lg font-medium">No products found</h3>
                <p className="text-muted-foreground">
                  Start selling digital products today
                </p>
              </div>
              <Link href={`/dashboard/${organizationSlug}/products/new`}>
                <Button variant="secondary">
                  <span>Create Product</span>
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </DashboardBody>
  )
}
