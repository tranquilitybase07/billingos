import { Metadata } from 'next'
import MetersPage from './MetersPage'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Meters',
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ organization: string }>
}) {
  const { organization } = await params

  return <MetersPage organizationSlug={organization} />
}
