import { cache } from 'react'
import { notFound } from 'next/navigation'
import { apiServer } from '@/lib/api/server'
import type { Organization } from '@/lib/api/types'

/**
 * Fetches an organization by its slug (server-side only)
 * Cached using React cache() for request deduplication
 */
const _getOrganizationBySlug = async (
  slug: string,
): Promise<Organization | undefined> => {
  try {
    const organizations = await apiServer.get<Organization[]>(
      '/organizations',
      {
        // Cache for 10 minutes (600 seconds)
        next: {
          tags: [`organizations:${slug}`],
          revalidate: 600,
        },
      },
    )

    // Find organization by slug
    return organizations.find((org) => org.slug === slug)
  } catch (error) {
    console.error('getOrganizationBySlug failed:', error)
    return undefined
  }
}

// Memoize for request deduplication
export const getOrganizationBySlug = cache(_getOrganizationBySlug)

/**
 * Fetches an organization by slug or throws a 404 error
 * Used in pages to ensure organization exists
 */
export const getOrganizationBySlugOrNotFound = async (
  slug: string,
): Promise<Organization> => {
  const organization = await getOrganizationBySlug(slug)

  if (!organization) {
    notFound() // Triggers Next.js 404 page
  }

  return organization
}

// orgPath moved to lib/navigation.ts to keep it client-safe
