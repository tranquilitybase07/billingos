import { cache } from 'react'
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

// orgPath moved to lib/navigation.ts to keep it client-safe
