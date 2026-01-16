import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { apiServer, APIError } from '@/lib/api/server'
import type { Organization } from '@/lib/api/types'

const LAST_VISITED_ORG_COOKIE = 'billingos_last_org'

/**
 * Dashboard entry point - Server Component
 * Follows Polar's pattern: check if user has organizations and redirect accordingly
 */
export default async function DashboardPage() {
  console.log('[Dashboard] Page component executing...')

  let organizations: Organization[]

  try {
    organizations = await apiServer.get<Organization[]>('/organizations')

    console.log('[Dashboard] Fetched organizations:', {
      count: organizations?.length,
      organizations: organizations?.map(org => ({ id: org.id, slug: org.slug, name: org.name }))
    })
  } catch (error) {
    // If backend is not running or endpoint doesn't exist, redirect to create page
    // This allows frontend development without backend
    console.log('[Dashboard] API error, redirecting to create page:', error instanceof APIError ? error.message : 'Unknown error')
    redirect('/dashboard/create')
  }

  // No organizations? Redirect to create page
  if (!organizations || organizations.length === 0) {
    console.log('[Dashboard] No organizations found, redirecting to /dashboard/create')
    redirect('/dashboard/create')
  }

  // Try to get last visited organization from cookie
  const cookieStore = await cookies()
  const lastVisitedSlug = cookieStore.get(LAST_VISITED_ORG_COOKIE)?.value

  let targetSlug: string

  if (lastVisitedSlug) {
    // Check if last visited org still exists and user has access
    const lastVisitedOrg = organizations.find(org => org.slug === lastVisitedSlug)

    if (lastVisitedOrg) {
      targetSlug = lastVisitedOrg.slug
      console.log(`[Dashboard] Redirecting to last visited org: ${targetSlug}`)
    } else {
      // Last visited org no longer exists or user lost access, use first org
      targetSlug = organizations[0].slug
      console.log(`[Dashboard] Last visited org not found, redirecting to first org: ${targetSlug}`)
    }
  } else {
    // No cookie, redirect to first organization
    targetSlug = organizations[0].slug
    console.log(`[Dashboard] No last visited org cookie, redirecting to first org: ${targetSlug}`)
  }

  console.log(`[Dashboard] Final redirect to: /dashboard/${targetSlug}`)
  redirect(`/dashboard/${targetSlug}`)
}
