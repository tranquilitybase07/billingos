'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Loading03Icon } from 'hugeicons-react'
import { useImportStatus } from '@/hooks/queries/import'

interface Props {
  organizationId: string
  jobId: string
}

// Live status for an in-flight migration job. The hook polls every 2s while
// the job is pending/running and stops on terminal states; the parent page
// will swap to ImportCompletedSummary as soon as status flips to completed.
export function MigrationProgress({ organizationId, jobId }: Props) {
  const { data: job, isLoading } = useImportStatus(organizationId, jobId)

  if (isLoading || !job) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Starting import…</CardTitle>
        </CardHeader>
      </Card>
    )
  }

  const customersDone = (job.progress.customers_done as number) ?? 0
  const customersTotal = (job.totals.customers as number) ?? null
  const subsDone = (job.progress.subs_done as number) ?? 0
  const subsTotal = (job.totals.subs as number) ?? null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Loading03Icon size={20} className="animate-spin" />
          <CardTitle>Import in progress</CardTitle>
        </div>
        <CardDescription>
          You can close this tab — the import will keep running in the
          background.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProgressRow
          label="Customers"
          done={customersDone}
          total={customersTotal}
        />
        <ProgressRow
          label="Subscriptions"
          done={subsDone}
          total={subsTotal}
        />
      </CardContent>
    </Card>
  )
}

function ProgressRow({
  label,
  done,
  total,
}: {
  label: string
  done: number
  total: number | null
}) {
  const pct =
    total && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {done}
          {total !== null ? ` / ${total}` : ''}
        </span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full transition-all duration-300"
          style={{
            // When we don't know totals yet (customers still iterating)
            // show an indeterminate-ish bar instead of 0.
            width: pct !== null ? `${pct}%` : '40%',
            opacity: pct !== null ? 1 : 0.5,
          }}
        />
      </div>
    </div>
  )
}
