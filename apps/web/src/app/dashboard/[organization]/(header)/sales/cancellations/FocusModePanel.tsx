'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Cancel01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  CheckmarkCircle01Icon,
} from 'hugeicons-react'
import type { CancellationRow } from './types'
import { REASON_LABELS, REASON_VARIANTS, formatDate, formatCurrencyShort } from './utils'

interface FocusModePanelProps {
  data: CancellationRow[]
  isOpen: boolean
  onClose: () => void
}

export function FocusModePanel({ data, isOpen, onClose }: FocusModePanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0)
      setCopied(false)
    }
  }, [isOpen])

  const copyEmail = useCallback(async (email: string) => {
    try {
      await navigator.clipboard.writeText(email)
    } catch {
      // clipboard API unavailable — silently skip
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const goNext = useCallback(() => {
    if (currentIndex < data.length - 1) {
      setDirection(1)
      setCurrentIndex((prev) => prev + 1)
      setCopied(false)
    }
  }, [currentIndex, data.length])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1)
      setCurrentIndex((prev) => prev - 1)
      setCopied(false)
    }
  }, [currentIndex])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, goNext, goPrev, onClose])

  if (!isOpen || data.length === 0) return null

  const entry = data[currentIndex]
  const progress = ((currentIndex + 1) / data.length) * 100

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="Focus Mode"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/98 backdrop-blur-sm"
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">Focus Mode</span>
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} of {data.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground hidden sm:block">
              ← → to navigate · esc to close
            </span>
            <button
              onClick={onClose}
              className="ml-2 p-1.5 text-muted-foreground hover:bg-muted rounded transition-colors"
            >
              <Cancel01Icon size={18} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="absolute top-[52px] left-0 right-0 h-[2px] bg-border">
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>

        {/* Card area */}
        <div className="flex items-center gap-4 w-full max-w-2xl px-4 mt-10">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className={`flex-shrink-0 p-2.5 rounded-full transition-colors ${
              currentIndex === 0
                ? 'text-muted-foreground/20 cursor-not-allowed'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <ArrowLeft01Icon size={24} />
          </button>

          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={entry.id}
                custom={direction}
                initial={{ opacity: 0, x: direction >= 0 ? 60 : -60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction >= 0 ? -60 : 60 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="w-full"
              >
                <div className="border border-border rounded-xl bg-card p-6">
                  {/* Customer + Plan */}
                  <div className="flex items-start justify-between mb-1 gap-2">
                    <h2 className="text-xl font-semibold text-foreground truncate">
                      {entry.customerName || 'Unknown'}
                    </h2>
                    {entry.plan && (
                      <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground border border-border">
                        {entry.plan}
                      </span>
                    )}
                  </div>

                  {/* Email */}
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-sm text-muted-foreground">{entry.customerEmail}</span>
                    <button
                      onClick={() => copyEmail(entry.customerEmail)}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                        copied
                          ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {copied ? (
                        <><CheckmarkCircle01Icon size={11} /> Copied</>
                      ) : (
                        <><Copy01Icon size={11} /> Copy</>
                      )}
                    </button>
                  </div>

                  {/* Reasons */}
                  {entry.reason && (
                    <div className="mb-5">
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-2">
                        Reason
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          REASON_VARIANTS[entry.reason] ?? REASON_VARIANTS.other
                        }`}
                      >
                        {REASON_LABELS[entry.reason] ?? entry.reason}
                      </span>
                    </div>
                  )}

                  {/* Notes */}
                  {entry.notes && (
                    <div className="mb-5 p-3 bg-muted/50 rounded-lg border border-border">
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
                        Notes
                      </span>
                      <p className="text-sm text-foreground leading-relaxed">{entry.notes}</p>
                    </div>
                  )}

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-0.5">
                        Lifetime Rev
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {formatCurrencyShort(entry.amount, entry.currency)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-0.5">
                        Tenure
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {entry.tenure}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-0.5">
                        Cancelled
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {formatDate(entry.cancelDate)}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <button
            onClick={goNext}
            disabled={currentIndex === data.length - 1}
            className={`flex-shrink-0 p-2.5 rounded-full transition-colors ${
              currentIndex === data.length - 1
                ? 'text-muted-foreground/20 cursor-not-allowed'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <ArrowRight01Icon size={24} />
          </button>
        </div>

        {/* Dot indicators (capped at 20; falls back to numeric for larger sets) */}
        {data.length <= 20 ? (
          <div className="mt-6 flex items-center gap-1.5 flex-wrap justify-center px-6 max-w-sm">
            {data.map((_, idx) => (
              <button
                key={idx}
                aria-label={`Go to entry ${idx + 1}`}
                onClick={() => {
                  setDirection(idx > currentIndex ? 1 : -1)
                  setCurrentIndex(idx)
                }}
                className={`rounded-full transition-all ${
                  idx === currentIndex
                    ? 'w-5 h-1.5 bg-primary'
                    : 'w-1.5 h-1.5 bg-border hover:bg-muted-foreground/40'
                }`}
              />
            ))}
          </div>
        ) : (
          <p className="mt-6 text-xs text-muted-foreground">
            {currentIndex + 1} / {data.length}
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
