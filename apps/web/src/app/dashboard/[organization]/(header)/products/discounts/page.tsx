import { Metadata } from 'next'
import DiscountsPage from './DiscountsPage'
import { DataTableSearchParams, parseSearchParams } from '@/utils/datatable'
import { getOrganizationBySlug } from '@/lib/organization'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Coupons',
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
  const { pagination, sorting } = parseSearchParams(search, [
    { id: 'name', desc: false },
  ])

  // Fetch organization to get the actual ID
  const organization = await getOrganizationBySlug(orgSlug)

  if (!organization) {
    return <div>Organization not found</div>
  }

  return (
    <DiscountsPage
      organizationId={organization.id}
      pagination={pagination}
      sorting={sorting}
      query={search.query}
    />
  )
}
