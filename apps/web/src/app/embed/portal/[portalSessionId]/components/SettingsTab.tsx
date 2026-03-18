'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { PortalCustomer } from '../hooks/usePortalData'

interface SettingsTabProps {
  customer: PortalCustomer
  sessionId: string
  accentColor?: string
  onUpdate: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 dark:text-gray-500 uppercase mb-3">
      {children}
    </p>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={`w-4 h-4 text-gray-400 dark:text-neutral-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function SettingsTab({ customer, sessionId, onUpdate }: SettingsTabProps) {
  const [name, setName] = useState(customer.name || '')
  const [street, setStreet] = useState(customer.billingAddress?.street || '')
  const [city, setCity] = useState(customer.billingAddress?.city || '')
  const [state, setState] = useState(customer.billingAddress?.state || '')
  const [postalCode, setPostalCode] = useState(customer.billingAddress?.postal_code || '')
  const [country, setCountry] = useState(customer.billingAddress?.country || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [addressOpen, setAddressOpen] = useState(false)

  useEffect(() => {
    const hasChanges =
      name !== (customer.name || '') ||
      street !== (customer.billingAddress?.street || '') ||
      city !== (customer.billingAddress?.city || '') ||
      state !== (customer.billingAddress?.state || '') ||
      postalCode !== (customer.billingAddress?.postal_code || '') ||
      country !== (customer.billingAddress?.country || '')
    setIsDirty(hasChanges)
    if (hasChanges) setSaveSuccess(false)
  }, [name, street, city, state, postalCode, country, customer])

  const handleSave = async () => {
    setIsSaving(true); setSaveError(null); setSaveSuccess(false)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/v1/portal/${sessionId}/customer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || undefined,
          billing_address: {
            street: street || undefined, city: city || undefined,
            state: state || undefined, postal_code: postalCode || undefined, country: country || undefined,
          },
        }),
      })
      if (!response.ok) throw new Error('Failed to update')
      onUpdate(); setIsDirty(false); setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setSaveError('Failed to save changes. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Account details */}
      <div className="rounded-2xl bg-[#f3f4f6] dark:bg-[#1c1c1e] border border-gray-200 dark:border-[#2e2e30] overflow-hidden">
        <div className="p-6">
          <SectionLabel>Account</SectionLabel>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 dark:text-neutral-400 font-medium">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 dark:text-neutral-400 font-medium">Email</Label>
              <Input value={customer.email || ''} readOnly className="opacity-60 cursor-default" />
              <p className="text-xs text-gray-400 dark:text-neutral-600">Email cannot be changed here.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Billing Address — collapsible */}
      <div className="rounded-2xl bg-[#f3f4f6] dark:bg-[#1c1c1e] border border-gray-200 dark:border-[#2e2e30] overflow-hidden">
        <button
          onClick={() => setAddressOpen((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
        >
          <div>
            <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 dark:text-gray-500 uppercase">
              Billing Address
            </p>
            {!addressOpen && (street || city || country) && (
              <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
                {[street, city, country].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
          <ChevronIcon open={addressOpen} />
        </button>
        {addressOpen && (
          <div className="px-6 pb-6 border-t border-gray-200 dark:border-[#2e2e30] pt-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 dark:text-neutral-400 font-medium">Street</Label>
              <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500 dark:text-neutral-400 font-medium">City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500 dark:text-neutral-400 font-medium">State</Label>
                <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500 dark:text-neutral-400 font-medium">Postal code</Label>
                <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="12345" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500 dark:text-neutral-400 font-medium">Country</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" maxLength={2} />
              </div>
            </div>
          </div>
        )}
      </div>

      {saveError && (
        <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
          {saveError}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="px-5 py-2.5 text-sm font-medium rounded-xl bg-[var(--portal-accent,#3b82f6)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {isSaving ? 'Saving...' : 'Save changes'}
        </button>
        {saveSuccess && (
          <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1.5 font-medium">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Saved
          </span>
        )}
      </div>
    </div>
  )
}
