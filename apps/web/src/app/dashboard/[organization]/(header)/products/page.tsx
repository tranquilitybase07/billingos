import { Metadata } from 'next'
import ProductsPage from './ProductsPage'
import { DataTableSearchParams, parseSearchParams } from '@/utils/datatable'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Products',
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ organization: string }>
  searchParams: Promise<DataTableSearchParams & { query?: string }>
}) {
  const { organization } = await params
  const search = await searchParams
  const { pagination, sorting } = parseSearchParams(
    search,
    [{ id: 'name', desc: false }],
    20,
  )

  // TODO: Fetch organization from API to get ID
  return (
    <ProductsPage
      organizationId="temp-org-id"
      organizationSlug={organization}
      pagination={pagination}
      sorting={sorting}
      query={search.query}
    />
  )
}
