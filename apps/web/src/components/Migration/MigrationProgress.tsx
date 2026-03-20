'use client'

import type { Migration } from '@/lib/api/types'
import { CheckmarkCircle01Icon, Loading03Icon, AlertCircleIcon } from 'hugeicons-react'

interface Props {
  migration: Migration
}

function ProgressRow({
  label,
  imported,
  total,
  isActive,
}: {
  label: string
  imported: number
  total: number | null
  isActive: boolean
}) {
  const done = total !== null && imported >= total
  const totalDisplay = total !== null ? total : '?'

  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
      <span className="text-muted-foreground w-32">{label}</span>
      <span className="font-mono text-right">
        {imported}/{totalDisplay}
      </span>
      <span className="w-6 text-right">
        {done ? (
          <CheckmarkCircle01Icon size={16} className="inline text-green-500" />
        ) : isActive ? (
          <Loading03Icon size={16} className="inline animate-spin text-primary" />
        ) : (
          <span className="text-muted-foreground">○</span>
        )}
      </span>
    </div>
  )
}

export function MigrationProgress({ migration }: Props) {
  const isRunning = migration.status === 'in_progress'
  const isComplete = migration.status === 'completed'
  const isPartial = migration.status === 'partial'
  const isFailed = migration.status === 'failed'

  // Determine which step is currently active
  const productsActive =
    isRunning &&
    (migration.products_total === null ||
      migration.products_imported < migration.products_total)
  const pricesActive =
    isRunning && !productsActive && migration.prices_imported < (migration.prices_total ?? Infinity)
  const customersActive =
    isRunning &&
    !productsActive &&
    !pricesActive &&
    migration.customers_imported < (migration.customers_total ?? Infinity)
  const subscriptionsActive =
    isRunning &&
    !productsActive &&
    !pricesActive &&
    !customersActive

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          {isRunning && 'Importing from Stripe...'}
          {isComplete && 'Import complete'}
          {isPartial && 'Import partially complete'}
          {isFailed && 'Import failed'}
          {migration.status === 'pending' && 'Ready to import'}
        </h3>
      </div>

      <div className="space-y-0.5">
        <ProgressRow
          label="Products"
          imported={migration.products_imported}
          total={migration.products_total}
          isActive={productsActive}
        />
        <ProgressRow
          label="Prices"
          imported={migration.prices_imported}
          total={migration.prices_total}
          isActive={pricesActive}
        />
        <ProgressRow
          label="Customers"
          imported={migration.customers_imported}
          total={migration.customers_total}
          isActive={customersActive}
        />
        <ProgressRow
          label="Subscriptions"
          imported={migration.subscriptions_imported}
          total={migration.subscriptions_total}
          isActive={subscriptionsActive}
        />
      </div>

      {/* Error summary */}
      {migration.errors && migration.errors.length > 0 && (
        <div className="mt-3 rounded-md bg-destructive/10 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertCircleIcon size={14} />
            {migration.errors.length} item{migration.errors.length !== 1 ? 's' : ''} failed to import
          </div>
        </div>
      )}
    </div>
  )
}
