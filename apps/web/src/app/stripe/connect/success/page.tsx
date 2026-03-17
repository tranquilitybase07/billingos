'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useStartMigration, useMigrationStatus } from '@/hooks/queries/migration'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckmarkCircle01Icon, Loading03Icon } from 'hugeicons-react'
import { MigrationProgress } from '@/components/Migration/MigrationProgress'

export default function StripeConnectSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const startMigration = useStartMigration()

  const migrationId = searchParams.get('migration_id')
  const organizationId = searchParams.get('organization_id')

  const { data: migration } = useMigrationStatus(
    migrationId,
    // Poll every 2 seconds while in progress
    migrationId ? 2000 : undefined,
  )

  const isRunning = migration?.status === 'in_progress'

  const handleStartImport = (includeArchived = false) => {
    if (!organizationId) return
    startMigration.mutate({ organization_id: organizationId, include_archived: includeArchived })
  }

  const handleGoToDashboard = () => {
    // Navigate to the org dashboard — we'll use the organization_id to redirect
    // since we don't have the slug here. The dashboard will redirect appropriately.
    router.push('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg p-8">
        <div className="mb-6 text-center">
          <CheckmarkCircle01Icon size={48} className="mx-auto mb-4 text-green-500" />
          <h1 className="text-2xl font-bold">Stripe account connected!</h1>
          <p className="mt-2 text-muted-foreground">
            Your existing Stripe account has been linked to BillingOS.
          </p>
        </div>

        {/* Migration status */}
        {migration && (
          <div className="mb-6">
            <MigrationProgress migration={migration} />
          </div>
        )}

        {/* Actions */}
        {!migration || migration.status === 'pending' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Import your existing Stripe data into BillingOS.
            </p>
            <Button
              className="w-full"
              onClick={() => handleStartImport(false)}
              disabled={startMigration.isPending}
            >
              {startMigration.isPending ? (
                <>
                  <Loading03Icon size={16} className="mr-2 animate-spin" />
                  Starting import...
                </>
              ) : (
                'Import Active Data'
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleStartImport(true)}
              disabled={startMigration.isPending}
            >
              Import All Data (including archived)
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={handleGoToDashboard}
            >
              Skip import, go to dashboard
            </Button>
          </div>
        ) : isRunning ? (
          <p className="text-center text-sm text-muted-foreground">
            <Loading03Icon size={16} className="mr-1 inline animate-spin" />
            Import in progress...
          </p>
        ) : (
          <Button className="w-full" onClick={handleGoToDashboard}>
            Go to dashboard
          </Button>
        )}
      </Card>
    </div>
  )
}
