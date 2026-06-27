'use client'

import { useState } from 'react'
import { TabsContent } from '@/components/ui/tabs'
import { PillTabs, PillTabsList, PillTabsTrigger } from '@/components/atoms/PillTabs'
import { Button } from '@/components/ui/button'
import { Add01Icon, ReloadIcon } from 'hugeicons-react'
import { useChurnFlows } from '@/hooks/queries/churn-flows'
import CancellationsPage from '../sales/cancellations/CancellationsPage'
import ChurnBuilderPage from './ChurnBuilderPage'

type Tab = 'overview' | 'flow'

export default function ChurnSection({
  organizationId,
  organizationSlug,
}: {
  organizationId: string
  organizationSlug: string
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const { data: flows, isLoading } = useChurnFlows(organizationId)
  const flow = flows?.[0]
  const hasFlow = !!flow
  const isLive = flow?.enabled ?? false

  return (
    <div className="mx-auto flex h-screen w-full max-w-screen-2xl flex-col overflow-hidden p-6">
      <PillTabs
        layoutId="churn-tab-indicator"
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <div className="flex flex-col gap-3 border-b border-border pb-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Churn</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              See why customers leave and win them back with targeted save offers.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PillTabsList>
              <PillTabsTrigger value="overview">Overview</PillTabsTrigger>
              <PillTabsTrigger value="flow">Save flow</PillTabsTrigger>
            </PillTabsList>
            {hasFlow && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${isLive
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-border bg-muted text-muted-foreground'
                  }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                    }`}
                />
                {isLive ? 'Live' : 'Off'}
              </span>
            )}
            {tab === 'overview' && (
              <Button onClick={() => setTab('flow')} className="gap-1.5">
                {hasFlow ? (
                  'Edit save flow'
                ) : (
                  <>
                    <Add01Icon size={16} />
                    Create save flow
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <TabsContent
          value="overview"
          className="mt-0 min-h-0 flex-1 overflow-y-auto"
        >
          {!isLoading && !hasFlow ? (
            <EmptyState onCreate={() => setTab('flow')} />
          ) : (
            <>
              {hasFlow && !isLive && (
                <div className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <div>
                      <p className="text-sm font-medium">Your save flow is off</p>
                      <p className="text-xs text-muted-foreground">
                        Cancelling customers won&apos;t see it until you turn it on.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setTab('flow')}
                  >
                    Review &amp; turn on
                  </Button>
                </div>
              )}
              <CancellationsPage
                organizationId={organizationId}
                organizationSlug={organizationSlug}
                embedded
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="flow" className="mt-0 min-h-0 flex-1">
          <ChurnBuilderPage organizationId={organizationId} embedded />
        </TabsContent>
      </PillTabs>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ReloadIcon size={22} />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Set up your save flow</h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Show cancelling customers a targeted offer — a discount, pause, or downgrade —
          before they go. Recovered cancellations and save-rate analytics show up here.
        </p>
      </div>
      <Button onClick={onCreate} className="gap-1.5">
        <Add01Icon size={16} />
        Create save flow
      </Button>
    </div>
  )
}
