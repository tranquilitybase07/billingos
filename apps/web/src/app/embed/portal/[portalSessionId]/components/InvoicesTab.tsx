'use client'

import * as React from 'react'
import type { PortalInvoice } from '../hooks/usePortalData'

interface InvoicesTabProps {
  invoices: PortalInvoice[]
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function getMonthKey(dateString: string) {
  const d = new Date(dateString)
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
}

function getMonthLabel(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20',
    open: 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/20',
    void: 'bg-gray-100 dark:bg-neutral-700/60 text-gray-500 dark:text-neutral-400 border-gray-200 dark:border-neutral-600/50',
    uncollectible: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20',
  }
  const cls = map[status] ?? 'bg-gray-100 dark:bg-neutral-700/60 text-gray-500 dark:text-neutral-400 border-gray-200 dark:border-neutral-600/50'
  return (
    <span className={`px-2.5 py-0.5 text-xs rounded-full border capitalize font-medium ${cls}`}>
      {status}
    </span>
  )
}

export function InvoicesTab({ invoices }: InvoicesTabProps) {
  if (invoices.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400 dark:text-neutral-500 text-sm mt-4">
        No invoices yet.
      </div>
    )
  }

  const groups = new Map<string, { label: string; invoices: PortalInvoice[] }>()
  for (const invoice of invoices) {
    const key = getMonthKey(invoice.createdAt)
    if (!groups.has(key)) {
      groups.set(key, { label: getMonthLabel(invoice.createdAt), invoices: [] })
    }
    groups.get(key)!.invoices.push(invoice)
  }

  return (
    <div className="space-y-5 mt-4">
      {Array.from(groups.entries()).map(([key, group]) => (
        <div key={key}>
          <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 dark:text-gray-500 uppercase mb-2">
            {group.label}
          </p>
          <div className="rounded-2xl border border-gray-200 dark:border-[#2e2e30] overflow-hidden divide-y divide-gray-200 dark:divide-[#2e2e30]">
            {group.invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between px-5 py-4 bg-white dark:bg-[#1c1c1e] hover:bg-[#f3f4f6] dark:hover:bg-[#242426] transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {invoice.number || `Invoice ${invoice.id.slice(-8)}`}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
                    {formatDate(invoice.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(invoice.amount, invoice.currency)}
                  </span>
                  <StatusBadge status={invoice.status} />
                  {invoice.invoicePdf && (
                    <button
                      onClick={() => window.open(invoice.invoicePdf, '_blank')}
                      className="text-xs text-[var(--portal-accent,#3b82f6)] hover:opacity-70 transition-opacity font-semibold"
                    >
                      PDF
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
