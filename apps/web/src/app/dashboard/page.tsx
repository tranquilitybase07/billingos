import { redirect } from 'next/navigation'
import { apiServer } from '@/lib/api/server'
import type { Organization } from '@/lib/api/types'

/**
 * Dashboard entry point - Server Component
 * Follows Polar's pattern: check if user has organizations and redirect accordingly
 */
export default async function DashboardPage() {
  console.log('[Dashboard] Page component executing...')

  const organizations = await apiServer.get<Organization[]>('/organizations')

  console.log('[Dashboard] Fetched organizations:', {
    count: organizations?.length,
    organizations: organizations?.map(org => ({ id: org.id, slug: org.slug, name: org.name }))
  })

  // No organizations? Redirect to create page
  if (!organizations || organizations.length === 0) {
    console.log('[Dashboard] No organizations found, redirecting to /dashboard/create')
    redirect('/dashboard/create')
  }

  // Has organizations? Redirect to first one
  // TODO: Implement cookie-based "last visited org" tracking like Polar
  const targetSlug = organizations[0].slug
  console.log(`[Dashboard] User has ${organizations.length} org(s), redirecting to: /dashboard/${targetSlug}`)
  redirect(`/dashboard/${targetSlug}`)
}
