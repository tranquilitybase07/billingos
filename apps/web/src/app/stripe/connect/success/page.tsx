'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useStartMigration, useMigrationStatus } from '@/hooks/queries/migration'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckmarkCircle01Icon, Loading03Icon } from 'hugeicons-react'
import { MigrationProgress } from '@/components/Migration/MigrationProgress'

function SuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const startMigration = useStartMigration()

  const migrationId = searchParams.get('migration_id')
  const organizationId = searchParams.get('organization_id')

  const { data: migration } = useMigrationStatus(
    migrationId,
    migrationId ? 2000 : undefined,
  )

  const isRunning = migration?.status === 'in_progress'

  const handleStartImport = (includeArchived = false) => {
    if (!organizationId) return
    startMigration.mutate({ organization_id: organizationId, include_archived: includeArchived })
  }

  const handleGoToDashboard = () => {
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

        {migration && (
          <div className="mb-6">
            <MigrationProgress migration={migration} />
          </div>
        )}

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

export default function StripeConnectSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-lg p-8 text-center">
          <Loading03Icon size={48} className="mx-auto mb-4 animate-spin text-primary" />
        </Card>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
