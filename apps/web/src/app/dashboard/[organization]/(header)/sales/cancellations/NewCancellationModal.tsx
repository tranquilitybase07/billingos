'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cancel01Icon } from 'hugeicons-react'
import { REASON_LABELS, calculateTenure } from './utils'
import type { CancellationRow } from './types'

interface NewCancellationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (entry: Omit<CancellationRow, 'id'>) => void
  defaultCurrency: string
}

const REASONS = Object.keys(REASON_LABELS) as Array<keyof typeof REASON_LABELS>

const REASON_CHIP: Record<string, string> = {
  too_expensive: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
  not_using: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/20',
  missing_features: 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/20',
  found_alternative: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
  other: 'bg-gray-100 dark:bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-500/20',
}

const INPUT_CLS =
  'w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground'

const LABEL_CLS = 'block text-xs font-medium text-muted-foreground mb-1.5'

export function NewCancellationModal({
  isOpen,
  onClose,
  onSave,
  defaultCurrency,
}: NewCancellationModalProps) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    plan: '',
    reason: '' as string,
    amount: '',
    joinDate: '',
    cancelDate: today,
    notes: '',
  })
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setForm({
      customerName: '',
      customerEmail: '',
      plan: '',
      reason: '',
      amount: '',
      joinDate: '',
      cancelDate: today,
      notes: '',
    })
    setError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.customerName || !form.customerEmail) {
      setError('Customer name and email are required.')
      return
    }
    onSave({
      customerName: form.customerName,
      customerEmail: form.customerEmail,
      plan: form.plan,
      reason: form.reason || null,
      notes: form.notes || null,
      amount: form.amount ? Math.round(Number(form.amount) * 100) : 0,
      currency: defaultCurrency,
      cancelDate: form.cancelDate || null,
      tenure: form.joinDate ? calculateTenure(form.joinDate, form.cancelDate) : '—',
      isManual: true,
    })
    reset()
    onClose()
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15 }}
          className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-foreground">Add Cancellation Entry</h2>
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Cancel01Icon size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto">
            <form id="new-cancellation-form" onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>Customer Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Acme Corp"
                    value={form.customerName}
                    onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="team@acme.com"
                    value={form.customerEmail}
                    onChange={(e) => setForm((p) => ({ ...p, customerEmail: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Plan</label>
                  <input
                    type="text"
                    placeholder="e.g. Pro"
                    value={form.plan}
                    onChange={(e) => setForm((p) => ({ ...p, plan: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>MRR ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 299"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Join Date</label>
                  <input
                    type="date"
                    value={form.joinDate}
                    onChange={(e) => setForm((p) => ({ ...p, joinDate: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Cancel Date</label>
                  <input
                    type="date"
                    value={form.cancelDate}
                    onChange={(e) => setForm((p) => ({ ...p, cancelDate: e.target.value }))}
                    className={INPUT_CLS}
                  />
                </div>
              </div>

              {/* Reason chips */}
              <div>
                <label className={LABEL_CLS}>Reason</label>
                <div className="flex flex-wrap gap-1.5">
                  {REASONS.map((r) => {
                    const selected = form.reason === r
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, reason: selected ? '' : r }))}
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                          selected
                            ? REASON_CHIP[r] ?? REASON_CHIP.other
                            : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                        }`}
                      >
                        {REASON_LABELS[r]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={LABEL_CLS}>Notes</label>
                <textarea
                  rows={3}
                  placeholder="Any additional context..."
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className={`${INPUT_CLS} resize-none`}
                />
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border bg-muted/30 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-cancellation-form"
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
            >
              Save Entry
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
