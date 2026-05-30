import { redirect } from 'next/navigation'
import { getOrganizationBySlug } from '@/lib/organization'
import { getUserOrganizations } from '@/lib/user'
import { OrganizationProvider } from '@/providers/OrganizationProvider'

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

  /* eslint-disable react-hooks/error-boundaries -- JSX in try/catch is needed for error handling with redirect in Server Components */
  try {
    // Fetch organization by slug. A missing org in the current environment is a
    // recoverable condition (env switch, deleted org, another account's bookmark,
    // stale back-button) — not a hard 404. Bounce to /dashboard, which resolves a
    // valid org for the active env (or sends to /dashboard/create).
    const organization = await getOrganizationBySlug(orgSlug)
    if (!organization) {
      redirect('/dashboard')
    }

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
  } catch (error: unknown) {
    // Re-throw Next.js internal errors (notFound, redirect, etc.)
    // These have a 'digest' property and must propagate to Next.js
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error
    }
    console.error('[Organization Layout] Error:', error)
    redirect('/dashboard')
  }
  /* eslint-enable react-hooks/error-boundaries */
}
