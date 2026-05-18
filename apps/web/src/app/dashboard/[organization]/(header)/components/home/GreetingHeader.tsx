'use client'

import { motion } from 'framer-motion'
import { useOrganization } from '@/providers/OrganizationProvider'

export function GreetingHeader() {
  const { organization } = useOrganization()

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <h2 className="text-3xl font-semibold tracking-tight">
        {getGreeting()}
      </h2>
      <p className="text-muted-foreground mt-1">
        Here&apos;s how {organization.name} is doing
      </p>
    </motion.div>
  )
}
