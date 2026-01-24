import { Metadata } from 'next'
import ProductsPage from './ProductsPage'
import { DataTableSearchParams, parseSearchParams } from '@/utils/datatable'
import { getOrganizationBySlug } from '@/lib/organization'

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
  const { organization: orgSlug } = await params
  const search = await searchParams
  const { pagination, sorting } = parseSearchParams(
    search,
    [{ id: 'name', desc: false }],
    20,
  )

  // Fetch organization to get the actual ID
  const organization = await getOrganizationBySlug(orgSlug)

  if (!organization) {
    // This shouldn't happen as layout already validates, but handle gracefully
    return <div>Organization not found</div>
  }

  return (
    <ProductsPage
      organizationId={organization.id}
      organizationSlug={orgSlug}
      pagination={pagination}
      sorting={sorting}
      query={search.query}
    />
  )
}
