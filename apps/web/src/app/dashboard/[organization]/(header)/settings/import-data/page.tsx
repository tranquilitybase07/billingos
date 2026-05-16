'use client'

import { useState } from 'react'
import { useOrganization } from '@/providers/OrganizationProvider'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import {
  ArrowDataTransferHorizontalIcon,
  Alert01Icon,
  CheckmarkCircle02Icon,
} from 'hugeicons-react'
import { useLatestImportJob } from '@/hooks/queries'
import { useAccountByOrganization } from '@/hooks/queries/account'
import { SettingsTabNav } from '../_components/SettingsTabNav'
import { ImportWizard } from './_components/ImportWizard'
import { MigrationProgress } from './_components/MigrationProgress'
import { ImportCompletedSummary } from './_components/ImportCompletedSummary'

// Status-aware shell. Renders one of:
//   - No Stripe connected: nudge to /settings/billing.
//   - No prior job: "Start Import" button.
//   - In-flight job: live progress.
//   - Completed job: summary + Re-run option.
//   - Failed job: error + retry.
export default function ImportDataPage() {
  const { organization } = useOrganization()
  const { data: account, isLoading: accountLoading } = useAccountByOrganization(
    organization.id,
  )
  const { data: latestJob, isLoading: jobLoading } = useLatestImportJob(
    organization.id,
  )
  const [wizardOpen, setWizardOpen] = useState(false)

  const stripeConnected = !!account?.stripe_id

  return (
    <DashboardBody className="space-y-6">
      <SettingsTabNav activeTab="import-data" />

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Import Data</h2>
        <p className="text-muted-foreground mt-2">
          Bring your existing Stripe customers, products, and subscriptions
          into BillingOS. Existing customers keep paying through Stripe — BOS
          starts powering portal, checkout, and feature gates from the moment
          import finishes.
        </p>
      </div>

      {accountLoading || jobLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !stripeConnected ? (
        <Card>
          <CardHeader>
            <CardTitle>Connect Stripe first</CardTitle>
            <CardDescription>
              You need to connect a Stripe account before you can import
              existing data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a
                href={`/dashboard/${organization.slug ?? organization.id}/settings/billing`}
              >
                Go to Billing settings
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : latestJob &&
        (latestJob.status === 'pending' || latestJob.status === 'running') ? (
        <MigrationProgress
          organizationId={organization.id}
          jobId={latestJob.id}
        />
      ) : latestJob && latestJob.status === 'completed' ? (
        <ImportCompletedSummary
          organizationId={organization.id}
          job={latestJob}
          onReRun={() => setWizardOpen(true)}
        />
      ) : latestJob && latestJob.status === 'failed' ? (
        <Card>
          <CardHeader>
            <CardTitle>Import failed</CardTitle>
            <CardDescription>
              Last attempt did not finish — check the error below and try
              again. All imports are idempotent, so retrying is safe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <Alert01Icon size={16} />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {latestJob.error_message ?? 'Unknown error.'}
              </AlertDescription>
            </Alert>
            <Button onClick={() => setWizardOpen(true)}>
              <ArrowDataTransferHorizontalIcon size={16} className="mr-2" />
              Retry import
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Ready to import</CardTitle>
            <CardDescription>
              We&rsquo;ll preview what&rsquo;s on your Stripe account, let you
              map products, and run the import in the background.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
              <li>Preview customers, products, and subscriptions</li>
              <li>Map each Stripe product to a BillingOS product</li>
              <li>
                Run the import — your existing customers start using BOS the
                next time they hit your app
              </li>
            </ol>
            <Button onClick={() => setWizardOpen(true)}>
              <ArrowDataTransferHorizontalIcon size={16} className="mr-2" />
              Start import
            </Button>
            {latestJob && latestJob.status === 'cancelled' && (
              <Alert>
                <CheckmarkCircle02Icon size={16} />
                <AlertTitle>Previous import was cancelled</AlertTitle>
                <AlertDescription>
                  Starting again is safe — all upserts are idempotent.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <ImportWizard
        organizationId={organization.id}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </DashboardBody>
  )
}
