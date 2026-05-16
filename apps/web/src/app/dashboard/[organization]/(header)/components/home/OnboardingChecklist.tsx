'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckmarkCircle01Icon, Cancel01Icon } from 'hugeicons-react'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useEnvironment } from '@/providers/EnvironmentProvider'
import { useOnboardingStatus } from '@/hooks/queries/organization'
import { CardFlat } from '@/components/ui/card'

const DISMISSED_KEY = (orgId: string) => `bos:onboarding:dismissed:${orgId}`

function loadDismissed(orgId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY(orgId))
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(arr)
  } catch {
    return new Set()
  }
}

function saveDismissed(orgId: string, ids: Set<string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    DISMISSED_KEY(orgId),
    JSON.stringify(Array.from(ids)),
  )
}

export function OnboardingChecklist() {
  const { organization } = useOrganization()
  const { environment } = useEnvironment()
  const env = environment === 'sandbox' ? 'sandbox' : 'production'
  const { data: status, isLoading } = useOnboardingStatus(organization.id, env)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Hydrate dismissed steps from localStorage after mount (SSR-safe).
  useEffect(() => {
    setDismissed(loadDismissed(organization.id))
  }, [organization.id])

  if (isLoading || !status) return null

  // Filter out dismissed steps before deciding visibility / progress.
  const visibleSteps = status.steps.filter((s) => !dismissed.has(s.id))
  const completedCount = visibleSteps.filter((s) => s.completed).length
  const totalCount = visibleSteps.length
  if (totalCount === 0 || completedCount === totalCount) return null

  const progressPercent = (completedCount / totalCount) * 100

  const handleDismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveDismissed(organization.id, next)
      return next
    })
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
      >
        <CardFlat className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-semibold whitespace-nowrap">
              {env === 'sandbox' ? 'Sandbox Setup' : 'Go Live'}
            </h3>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {completedCount} of {totalCount} complete
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
            {visibleSteps.map((step) =>
              step.completed ? (
                <div
                  key={step.id}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm text-muted-foreground"
                >
                  <CheckmarkCircle01Icon size={14} className="text-green-500 shrink-0" />
                  {step.label}
                </div>
              ) : (
                <div
                  key={step.id}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                >
                  <Link
                    href={step.href}
                    {...(step.href.startsWith('http')
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                    className="inline-flex items-center gap-1.5"
                  >
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                    {step.label}
                  </Link>
                  {step.dismissible && (
                    <button
                      type="button"
                      aria-label={`Dismiss ${step.label}`}
                      onClick={() => handleDismiss(step.id)}
                      className="text-muted-foreground/60 hover:text-foreground -mr-1 ml-1 rounded-full p-0.5 transition-colors"
                    >
                      <Cancel01Icon size={12} />
                    </button>
                  )}
                </div>
              ),
            )}
          </div>
        </CardFlat>
      </motion.div>
    </AnimatePresence>
  )
}
