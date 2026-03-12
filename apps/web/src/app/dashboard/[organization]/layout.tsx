import { redirect, notFound } from 'next/navigation'
import { getOrganizationBySlugOrNotFound, getOrganizationBySlug } from '@/lib/organization'
import { getUserOrganizations } from '@/lib/user'
import { OrganizationProvider } from '@/providers/OrganizationProvider'
import type { Organization } from '@/lib/api/types'

interface OrganizationLayoutProps {
  children: React.ReactNode
  params: Promise<{
    organization: string
  }>
}

export default async function OrganizationLayout({
  children,
  params,
}: OrganizationLayoutProps) {
  const { organization: orgSlug } = await params

  try {
    // Fetch organization by slug
    const organization = await getOrganizationBySlugOrNotFound(orgSlug)

    // Fetch user's organizations for switcher
    let userOrganizations = await getUserOrganizations()

    // Handle race condition: new org might not be in cached list yet
    if (!userOrganizations.some((org) => org.id === organization.id)) {
      // Wait a moment for database to sync, then bypass cache
      await new Promise((resolve) => setTimeout(resolve, 500))
      userOrganizations = await getUserOrganizations(true) // Bypass cache
    }

    // If user is not a member, redirect
    if (!userOrganizations.some((org) => org.id === organization.id)) {
      redirect('/dashboard')
    }

    // Note: Cookie for last visited org is set in middleware (src/middleware.ts)
    // because Next.js 15+ doesn't allow setting cookies in layouts

    // Wrap children in EnvironmentProvider and OrganizationProvider
    return (
      <OrganizationProvider
        organization={organization}
        organizations={userOrganizations}
      >
        {children}
      </OrganizationProvider>
    )
  } catch (error) {
    console.error('[Organization Layout] Error:', error)
    redirect('/dashboard')
  }
}
