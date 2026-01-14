import { Metadata } from 'next'
import BenefitsPage from './BenefitsPage'

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
  const { organization } = await params

  // TODO: Fetch organization from API to get ID
  return (
    <BenefitsPage
      organizationId="temp-org-id"
      organizationSlug={organization}
    />
  )
}
