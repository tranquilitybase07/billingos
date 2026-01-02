import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { apiServer } from '@/lib/api/server'
import type { Organization, User } from '@/lib/api/types'

/**
 * Get the currently authenticated user from Supabase
 * Cached using React cache() for request deduplication
 */
const _getAuthenticatedUser = async (): Promise<User | null> => {
  try {
    const supabase = await createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      return null
    }

    // Return user from Supabase session
    return {
      id: session.user.id,
      email: session.user.email!,
      created_at: session.user.created_at,
    } as User
  } catch (error) {
    console.error('getAuthenticatedUser failed:', error)
    return null
  }
}

export const getAuthenticatedUser = cache(_getAuthenticatedUser)

/**
 * Retry helper with exponential backoff
 */
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
): Promise<T> => {
  let lastError: any
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)))
      }
    }
  }
  throw lastError
}

/**
 * Fetches all organizations that the current user belongs to
 * @param bypassCache - If true, bypasses the cache (useful during onboarding race conditions)
 */
const _getUserOrganizations = async (
  bypassCache: boolean = false,
): Promise<Organization[]> => {
  const user = await getAuthenticatedUser()
  if (!user) return []

  try {
    const requestOptions: RequestInit = {}

    if (bypassCache) {
      requestOptions.cache = 'no-cache'
    } else {
      requestOptions.next = {
        tags: [`users:${user.id}:organizations`],
        revalidate: 600, // Cache for 10 minutes
      }
    }

    const organizations = await retryWithBackoff(() =>
      apiServer.get<Organization[]>('/organizations', requestOptions),
    )

    return organizations
  } catch (error) {
    console.error('getUserOrganizations failed:', error)
    return []
  }
}

/**
 * Get user's organizations with optional cache bypass
 * Use bypassCache=true during onboarding to handle race conditions
 */
export const getUserOrganizations = async (
  bypassCache: boolean = false,
): Promise<Organization[]> => {
  if (bypassCache) {
    return _getUserOrganizations(true)
  }
  // Use cached version by default
  return cache(() => _getUserOrganizations(false))()
}

/**
 * Check if a user is a member of an organization
 */
export const checkUserIsMember = async (
  orgId: string,
  userId: string,
): Promise<boolean> => {
  const organizations = await getUserOrganizations()
  return organizations.some((org) => org.id === orgId)
}
