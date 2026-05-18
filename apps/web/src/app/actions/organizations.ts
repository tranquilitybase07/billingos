'use server'

import { updateTag } from 'next/cache'
import { getAuthenticatedUser } from '@/lib/user'

export async function revalidateUserOrganizations(): Promise<void> {
  const user = await getAuthenticatedUser()
  if (!user) return
  updateTag(`users:${user.id}:organizations`)
}
