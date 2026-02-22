'use client'

import type { ProrationInfo, PlanInfo } from '@/lib/api/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface ProrationPreviewProps {
  currentPlan: PlanInfo
  newPlan: PlanInfo
  proration: ProrationInfo
  changeType: 'upgrade' | 'downgrade'
  effectiveDate: string
  notes?: string[]
}

export function ProrationPreview({
  currentPlan,
  newPlan,
  proration,
  changeType,
  effectiveDate,
  notes,
}: ProrationPreviewProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const isImmediate = new Date(effectiveDate).getTime() - Date.now() < 60000 // Within 1 minute

  return (
    <div className="space-y-4">
      {/* Change Summary */}
      <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {changeType === 'upgrade' ? (
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {changeType === 'upgrade' ? 'Upgrading' : 'Downgrading'} your plan
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              {currentPlan.name} → {newPlan.name}
            </p>
          </div>
        </div>
      </div>

      {/* Proration Breakdown */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">
          Billing Details
        </h4>

        <div className="space-y-2">
          {/* Unused Credit */}
          {proration.unused_credit > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Credit for unused time on {currentPlan.name}
              </span>
              <span className="text-green-600 dark:text-green-400 font-medium">
                -{formatCurrency(proration.unused_credit, currentPlan.currency)}
              </span>
            </div>
          )}

          {/* New Plan Charge */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              Prorated charge for {newPlan.name}
            </span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">
              {formatCurrency(proration.new_plan_charge, newPlan.currency)}
            </span>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

          {/* Total Due */}
          <div className="flex justify-between items-center">
            <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {isImmediate ? 'Amount due today' : 'Amount due at period end'}
            </span>
            <span className={`text-lg font-bold ${
              proration.immediate_payment > 0
                ? 'text-gray-900 dark:text-gray-100'
                : 'text-green-600 dark:text-green-400'
            }`}>
              {formatCurrency(proration.immediate_payment, newPlan.currency)}
            </span>
          </div>
        </div>

        {/* Effective Date */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600 dark:text-gray-400">Effective date</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">
              {isImmediate ? 'Immediately' : formatDate(effectiveDate)}
            </span>
          </div>
        </div>
      </Card>

      {/* Important Notes */}
      {notes && notes.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
            Important Information
          </h4>
          <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {notes.map((note, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-gray-400 dark:text-gray-600 mt-0.5">•</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
