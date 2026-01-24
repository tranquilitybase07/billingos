import { Metadata } from 'next'
import BenefitsPage from './BenefitsPage'
import { getOrganizationBySlug } from '@/lib/organization'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Benefits',
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
    <BenefitsPage
      organizationId={organization.id}
      organizationSlug={orgSlug}
    />
  )
}
