'use server'

import { updateTag } from 'next/cache'
import { getAuthenticatedUser } from '@/lib/user'

/**
 * Busts the Next.js fetch cache tag that `getUserOrganizations` uses, so the
 * next server render sees the freshly-created (or removed) org. Without this,
 * a new org may not appear for up to `revalidate: 600` seconds, causing the
 * post-create navigation to fall through the layout's membership check and
 * bounce the user back to `/dashboard/create`.
 *
 * Uses `updateTag` (not `revalidateTag`) because we need read-your-own-writes
 * semantics: the very next render must see the new org, not a stale value
 * being revalidated in the background.
 */
export async function revalidateUserOrganizations(): Promise<void> {
  const user = await getAuthenticatedUser()
  if (!user) return
  updateTag(`users:${user.id}:organizations`)
}
