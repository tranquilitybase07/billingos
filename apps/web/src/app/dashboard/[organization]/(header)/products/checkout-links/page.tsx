import { Metadata } from 'next'
import CheckoutLinksPage from './CheckoutLinksPage'
import { getOrganizationBySlug } from '@/lib/organization'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Checkout Links',
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ organization: string }>
}) {
  const { organization: orgSlug } = await params

  // Fetch organization to get the actual ID
  const organization = await getOrganizationBySlug(orgSlug)

  if (!organization) {
    return <div>Organization not found</div>
  }

  return (
    <CheckoutLinksPage
      organizationId={organization.id}
      organizationSlug={orgSlug}
    />
  )
}
