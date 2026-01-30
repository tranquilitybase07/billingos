import { Metadata } from 'next'
import { getOrganizationBySlug } from '@/lib/organization'
import OrdersPage from './OrdersPage'

export const metadata: Metadata = {
  title: 'Orders',
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ organization: string }>
  searchParams: Promise<{ product_id?: string }>
}) {
  const { organization: orgSlug } = await params
  const search = await searchParams
  const organization = await getOrganizationBySlug(orgSlug)

  if (!organization) {
    return <div>Organization not found</div>
  }

  return (
    <OrdersPage
      organizationId={organization.id}
      organizationSlug={orgSlug}
      productIdFilter={search.product_id}
    />
  )
}
