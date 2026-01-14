import { Metadata } from 'next'
import DiscountsPage from './DiscountsPage'
import { DataTableSearchParams, parseSearchParams } from '@/utils/datatable'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Discounts',
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
  const { pagination, sorting } = parseSearchParams(search, [
    { id: 'name', desc: false },
  ])

  // TODO: Fetch organization from API to get ID
  return (
    <DiscountsPage
      organizationId="temp-org-id"
      organizationSlug={organization}
      pagination={pagination}
      sorting={sorting}
      query={search.query}
    />
  )
}
