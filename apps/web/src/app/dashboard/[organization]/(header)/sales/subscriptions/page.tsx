import { Metadata } from 'next'
import { getOrganizationBySlug } from '@/lib/organization'
import SubscriptionsPage from './SubscriptionsPage'

export const metadata: Metadata = {
  title: 'Subscriptions',
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ organization: string }>
  searchParams: Promise<{ product_id?: string; status?: string }>
}) {
  const { organization: orgSlug } = await params
  const search = await searchParams
  const organization = await getOrganizationBySlug(orgSlug)

  if (!organization) {
    return <div>Organization not found</div>
  }

  return (
    <SubscriptionsPage
      organizationId={organization.id}
      organizationSlug={orgSlug}
      productIdFilter={search.product_id}
      statusFilter={search.status}
    />
  )
}
