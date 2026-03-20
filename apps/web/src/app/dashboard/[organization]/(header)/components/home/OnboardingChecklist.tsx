'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckmarkCircle01Icon } from 'hugeicons-react'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useEnvironment } from '@/providers/EnvironmentProvider'
import { useOnboardingStatus } from '@/hooks/queries/organization'
import { Card } from '@/components/ui/card'

export function OnboardingChecklist() {
  const { organization } = useOrganization()
  const { environment } = useEnvironment()
  const env = environment === 'sandbox' ? 'sandbox' : 'production'
  const { data: status, isLoading } = useOnboardingStatus(organization.id, env)

  if (isLoading || !status || status.all_complete) return null

  const progressPercent = (status.completed_count / status.total_count) * 100

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-semibold whitespace-nowrap">
              {env === 'sandbox' ? 'Sandbox Setup' : 'Go Live'}
            </h3>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {status.completed_count} of {status.total_count} complete
            </span>
            <div className="flex-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {Math.round(progressPercent)}%
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {status.steps.map((step) =>
              step.completed ? (
                <div
                  key={step.id}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm text-muted-foreground"
                >
                  <CheckmarkCircle01Icon size={14} className="text-green-500 shrink-0" />
                  {step.label}
                </div>
              ) : (
                <Link
                  key={step.id}
                  href={step.href}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                >
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                  {step.label}
                </Link>
              )
            )}
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}
