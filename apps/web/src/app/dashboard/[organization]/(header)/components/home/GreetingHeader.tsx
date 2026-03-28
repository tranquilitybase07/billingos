'use client'

import { motion } from 'framer-motion'
import { useAuth } from '@/providers/AuthProvider'
import { useOrganization } from '@/providers/OrganizationProvider'

export function GreetingHeader() {
  const { user } = useAuth()
  const { organization } = useOrganization()

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const getName = () => {
    if (!user) return ''
    const meta = user.user_metadata
    const name = meta?.full_name || meta?.name
    if (name) return name
    return user.email?.split('@')[0] || ''
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <h2 className="text-3xl font-bold tracking-tight">
        {getGreeting()}, {getName()}
      </h2>
      <p className="text-muted-foreground mt-1">
        Here&apos;s how {organization.name} is doing
      </p>
    </motion.div>
  )
}
