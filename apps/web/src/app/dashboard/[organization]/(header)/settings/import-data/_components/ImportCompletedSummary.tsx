'use client'

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import {
  CheckmarkCircle02Icon,
  Alert01Icon,
  ArrowDataTransferHorizontalIcon,
  InformationCircleIcon,
} from 'hugeicons-react'
import type { MigrationJob } from '@/hooks/queries/import'
import { NeedsAttentionDrawer } from './NeedsAttentionDrawer'

interface Props {
  organizationId: string
  job: MigrationJob
  onReRun: () => void
}

// Reports the outcome of the most recent completed import. Two-bucket split:
//   Bucket 1 (pending_binding_count): informational line, no action needed.
//   Bucket 2 (stuck_customers): alert + drawer for manual binding.
export function ImportCompletedSummary({ organizationId, job, onReRun }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const customersImported = (job.totals.customers_imported as number) ?? 0
  const subsImported = (job.totals.subs_imported as number) ?? 0
  const subsSkipped = (job.totals.subs_skipped_no_mapping as number) ?? 0
  const stuckCount = job.stuck_customers.length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CheckmarkCircle02Icon
            size={20}
            className="text-emerald-500 dark:text-emerald-400"
          />
          <CardTitle>Import complete</CardTitle>
        </div>
        <CardDescription>
          Existing customers can use BillingOS immediately. Upgrades,
          downgrades, and cancellations flow through the same Stripe
          subscriptions they were already paying through.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="text-muted-foreground space-y-1 text-sm">
          <li className="flex items-center gap-2">
            <CheckmarkCircle02Icon
              size={14}
              className="text-emerald-500 dark:text-emerald-400"
            />
            <span>
              <strong className="text-foreground tabular-nums">
                {customersImported}
              </strong>{' '}
              customer{customersImported === 1 ? '' : 's'} imported
            </span>
          </li>
          <li className="flex items-center gap-2">
            <CheckmarkCircle02Icon
              size={14}
              className="text-emerald-500 dark:text-emerald-400"
            />
            <span>
              <strong className="text-foreground tabular-nums">
                {subsImported}
              </strong>{' '}
              subscription{subsImported === 1 ? '' : 's'} imported
            </span>
          </li>
          {subsSkipped > 0 && (
            <li className="flex items-center gap-2">
              <Alert01Icon
                size={14}
                className="text-amber-500 dark:text-amber-400"
              />
              <span>
                <strong className="text-foreground tabular-nums">
                  {subsSkipped}
                </strong>{' '}
                subscription{subsSkipped === 1 ? '' : 's'} skipped — no product
                mapping
              </span>
            </li>
          )}
        </ul>

        {/* Bucket 1: pending lazy bind — informational, no action */}
        {job.pending_binding_count > 0 && (
          <Alert>
            <InformationCircleIcon size={16} />
            <AlertTitle>
              {job.pending_binding_count} customer
              {job.pending_binding_count === 1 ? '' : 's'} will bind
              automatically
            </AlertTitle>
            <AlertDescription>
              These customers have a unique email. They&rsquo;ll be linked to
              your user IDs the next time they hit your app — pass{' '}
              <code className="font-mono text-xs">email</code> when creating a
              session token to make this seamless.
            </AlertDescription>
          </Alert>
        )}

        {/* Bucket 2: stuck — alert + drawer */}
        {stuckCount > 0 && (
          <Alert variant="destructive">
            <Alert01Icon size={16} />
            <AlertTitle>
              {stuckCount} customer{stuckCount === 1 ? '' : 's'} need attention
            </AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>
                These customers have no email or share an email with another
                customer — they can&rsquo;t be auto-bound.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDrawerOpen(true)}
              >
                Resolve
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onReRun}>
            <ArrowDataTransferHorizontalIcon size={16} className="mr-2" />
            Re-run import
          </Button>
        </div>
      </CardContent>

      <NeedsAttentionDrawer
        organizationId={organizationId}
        job={job}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </Card>
  )
}
