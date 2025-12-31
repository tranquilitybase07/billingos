import { redirect, notFound } from 'next/navigation'
import { apiServer } from '@/lib/api/server'
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
  console.log('[Organization Layout] Starting for slug:', orgSlug)

  try {
    // Fetch user's organizations
    console.log('[Organization Layout] Fetching organizations from API...')
    let userOrganizations = await apiServer.get<Organization[]>('/organizations')

    console.log('[Organization Layout] First fetch - User organizations:', {
      count: userOrganizations?.length,
      organizations: userOrganizations?.map(org => ({ id: org.id, slug: org.slug, name: org.name }))
    })

    // Find organization by slug
    let organization = userOrganizations.find((org) => org.slug === orgSlug)

    console.log('[Organization Layout] First pass - Found organization:', organization ? { id: organization.id, slug: organization.slug, name: organization.name } : null)

    // Handle race condition: new org might not be in cached list yet
    // This matches Polar's dual-pass verification pattern
    if (!organization) {
      console.log('[Organization Layout] Organization not found in first pass, waiting 500ms for DB sync...')
      // Wait a moment for database to sync
      await new Promise(resolve => setTimeout(resolve, 500))

      // Try fetching again (bypassing cache)
      console.log('[Organization Layout] Second fetch attempt...')
      userOrganizations = await apiServer.get<Organization[]>('/organizations')
      organization = userOrganizations.find((org) => org.slug === orgSlug)

      console.log('[Organization Layout] Second pass - Found organization:', organization ? { id: organization.id, slug: organization.slug, name: organization.name } : null)
    }

    // If organization still not found, either doesn't exist or user isn't a member
    if (!organization) {
      console.log('[Organization Layout] Organization still not found after dual-pass, calling notFound()')
      notFound()
    }

    // User is a verified member - render children
    console.log('[Organization Layout] User verified as member, rendering children')
    // TODO: Wrap in OrganizationContextProvider like Polar does
    return <>{children}</>
  } catch (error) {
    console.error('[Organization Layout] ERROR caught:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name
    })
    // On error, redirect back to dashboard
    console.log('[Organization Layout] Redirecting to /dashboard due to error')
    redirect('/dashboard')
  }
}
