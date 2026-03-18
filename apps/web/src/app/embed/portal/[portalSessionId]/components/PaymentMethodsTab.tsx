'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import type { PortalPaymentMethod } from '../hooks/usePortalData'

interface PaymentMethodsTabProps {
  paymentMethods: PortalPaymentMethod[]
  sessionId: string
  onUpdate: () => void
  onAdd: () => void
}

function CardBrandLabel({ brand }: { brand: string }) {
  const labels: Record<string, string> = {
    visa: 'VISA',
    mastercard: 'MC',
    amex: 'AMEX',
    discover: 'DISC',
  }
  return (
    <span className="inline-flex items-center justify-center w-11 h-7 rounded-lg bg-white dark:bg-[#0f0f11] border border-gray-200 dark:border-[#2e2e30] text-[10px] font-bold text-gray-500 dark:text-neutral-300 tracking-wide shadow-xs">
      {labels[brand.toLowerCase()] ?? brand.slice(0, 4).toUpperCase()}
    </span>
  )
}

function StripePaymentElement({
  stripePromise,
  clientSecret,
  onElementsReady,
}: {
  stripePromise: any
  clientSecret: string
  onElementsReady: (elements: any) => void
}) {
  const [localElements, setLocalElements] = useState<any>(null)

  useEffect(() => {
    if (!stripePromise || !clientSecret) return
    const setupElements = async () => {
      const stripe = await stripePromise
      const elementsInstance = stripe.elements({ clientSecret })
      const paymentElement = elementsInstance.create('payment')
      paymentElement.mount('#portal-payment-element')
      setLocalElements(elementsInstance)
      onElementsReady(elementsInstance)
    }
    setupElements()
    return () => { if (localElements) localElements.unmount() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripePromise, clientSecret])

  return <div id="portal-payment-element" className="min-h-[200px]" />
}

export function PaymentMethodsTab({ paymentMethods, sessionId, onUpdate, onAdd }: PaymentMethodsTabProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [stripeInstance, setStripeInstance] = useState<any>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [elements, setElements] = useState<any>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [defaultError, setDefaultError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)

  useEffect(() => {
    if (showAddModal && !stripeInstance) loadStripe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal])

  const loadStripe = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/v1/portal/${sessionId}/setup-intent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) throw new Error('Failed to create SetupIntent')
      const data = await response.json()
      setClientSecret(data.clientSecret)
      const { loadStripe: loadStripeLib } = await import('@stripe/stripe-js')
      setStripeInstance(await loadStripeLib(data.publishableKey, { stripeAccount: data.stripeAccount }))
    } catch {
      setAddError('Failed to initialize payment form')
    }
  }

  const handleAddCard = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!stripeInstance || !clientSecret || !elements) { setAddError('Payment form not ready'); return }
    setIsLoading(true); setAddError(null)
    try {
      const { error: submitError } = await stripeInstance.confirmSetup({
        elements, confirmParams: { return_url: window.location.href }, redirect: 'if_required',
      })
      if (submitError) { setAddError(submitError.message || 'Failed to add payment method'); setIsLoading(false); return }
      setShowAddModal(false); setClientSecret(null); setStripeInstance(null); setElements(null)
      onAdd()
    } catch (err: any) {
      setAddError(err.message || 'Failed to add payment method')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemove = async (paymentMethodId: string) => {
    setRemoveError(null); setRemovingId(paymentMethodId)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const r = await fetch(`${apiUrl}/v1/portal/${sessionId}/payment-methods/${paymentMethodId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      onUpdate()
    } catch { setRemoveError('Failed to remove payment method. Please try again.') }
    finally { setRemovingId(null) }
  }

  const handleSetDefault = async (paymentMethodId: string) => {
    setDefaultError(null); setSettingDefaultId(paymentMethodId)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const r = await fetch(`${apiUrl}/v1/portal/${sessionId}/default-payment-method`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentMethodId }),
      })
      if (!r.ok) throw new Error()
      onUpdate()
    } catch { setDefaultError('Failed to update default payment method.') }
    finally { setSettingDefaultId(null) }
  }

  return (
    <div className="space-y-4 mt-4">
      {(removeError || defaultError) && (
        <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
          {removeError || defaultError}
        </div>
      )}

      {paymentMethods.length > 0 && (
        <>
          <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 dark:text-gray-500 uppercase">
            Saved cards
          </p>
          <div className="rounded-2xl border border-gray-200 dark:border-[#2e2e30] overflow-hidden divide-y divide-gray-200 dark:divide-[#2e2e30]">
            {paymentMethods.map((pm) => (
              <div key={pm.id} className="flex items-center justify-between px-5 py-4 bg-white dark:bg-[#1c1c1e]">
                <div className="flex items-center gap-3">
                  <CardBrandLabel brand={pm.brand || 'card'} />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">•••• {pm.last4}</p>
                    <p className="text-xs text-gray-400 dark:text-neutral-500">
                      Expires {pm.expiryMonth}/{pm.expiryYear}
                    </p>
                  </div>
                  {pm.isDefault && (
                    <span className="px-2.5 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 font-medium">
                      Default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {!pm.isDefault && (
                    <button
                      onClick={() => handleSetDefault(pm.id)}
                      disabled={settingDefaultId === pm.id}
                      className="text-xs text-gray-400 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-white transition-colors disabled:opacity-50"
                    >
                      {settingDefaultId === pm.id ? 'Updating...' : 'Set default'}
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(pm.id)}
                    disabled={removingId === pm.id}
                    className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors disabled:opacity-50"
                  >
                    {removingId === pm.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {paymentMethods.length === 0 && (
        <div className="py-12 text-center text-gray-400 dark:text-neutral-500 text-sm">
          No payment methods on file.
        </div>
      )}

      <button
        onClick={() => { setShowAddModal(true); setAddError(null) }}
        className="px-5 py-2.5 text-sm font-medium rounded-xl bg-[var(--portal-accent,#3b82f6)] text-white hover:opacity-90 transition-opacity"
      >
        Add payment method
      </button>

      {/* Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddModal(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200 dark:border-[#2e2e30] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-[#2e2e30]">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 dark:text-gray-500 uppercase">Payment</p>
                <h3 className="font-bold text-gray-900 dark:text-white mt-0.5">Add payment method</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/80 transition-colors text-lg"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAddCard}>
              <div className="px-6 py-5">
                {addError && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                    {addError}
                  </div>
                )}
                {clientSecret && stripeInstance ? (
                  <StripePaymentElement stripePromise={stripeInstance} clientSecret={clientSecret} onElementsReady={setElements} />
                ) : !addError ? (
                  <div className="flex justify-center py-10">
                    <div className="w-6 h-6 rounded-full border-[3px] border-gray-200 dark:border-white/10 border-t-gray-500 dark:border-t-white/50 animate-spin" />
                  </div>
                ) : null}
              </div>
              <div className="px-6 py-4 bg-gray-50 dark:bg-[#141415] border-t border-gray-100 dark:border-[#2e2e30] flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAddModal(false)} disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-[#2e2e30] text-gray-600 dark:text-white/60 hover:bg-white dark:hover:bg-white/5 transition-all disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={isLoading || !clientSecret}
                  className="px-4 py-2 text-sm font-medium rounded-xl bg-[var(--portal-accent,#3b82f6)] text-white hover:opacity-90 transition-opacity disabled:opacity-50">
                  {isLoading ? 'Adding...' : 'Add card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
