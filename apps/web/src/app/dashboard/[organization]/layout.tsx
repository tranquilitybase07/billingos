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

/**
 * Organization Layout - Server Component
 * Follows Polar's pattern: validates user membership and provides organization context
 * Implements dual-pass verification to handle race conditions after org creation
 */
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
    // This matches Polar's dual-pass verification pattern
    if (!userOrganizations.some((org) => org.id === organization.id)) {
      // Wait a moment for database to sync, then bypass cache
      await new Promise((resolve) => setTimeout(resolve, 500))
      userOrganizations = await getUserOrganizations(true) // Bypass cache
    }

    // If user is not a member, redirect
    if (!userOrganizations.some((org) => org.id === organization.id)) {
      redirect('/dashboard')
    }

    // Wrap children in OrganizationProvider for client components
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
