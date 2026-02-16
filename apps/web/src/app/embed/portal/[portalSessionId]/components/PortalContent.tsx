'use client'

import { useEffect, useState } from 'react'
import { usePortalData } from '../hooks/usePortalData'
import { useParentMessaging } from '../hooks/useParentMessaging'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

interface PortalContentProps {
  sessionId: string
  defaultTab?: string
}

export function PortalContent({ sessionId, defaultTab = 'subscription' }: PortalContentProps) {
  const { data, loading, error, refresh } = usePortalData(sessionId)
  const { sendMessage } = useParentMessaging()
  const [activeTab, setActiveTab] = useState(defaultTab)

  // Send PORTAL_READY when data is loaded
  useEffect(() => {
    if (data && !loading) {
      sendMessage({ type: 'PORTAL_READY' })
      console.log('[PortalContent] Portal ready, data loaded')
    }
  }, [data, loading, sendMessage])

  // Send height updates when content changes
  useEffect(() => {
    const updateHeight = () => {
      const height = document.body.scrollHeight
      sendMessage({
        type: 'HEIGHT_CHANGED',
        payload: { height }
      })
    }

    // Update immediately
    updateHeight()

    // Update on window resize
    window.addEventListener('resize', updateHeight)

    // Use ResizeObserver to detect content changes
    const observer = new ResizeObserver(updateHeight)
    observer.observe(document.body)

    return () => {
      window.removeEventListener('resize', updateHeight)
      observer.disconnect()
    }
  }, [activeTab, data, sendMessage])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your portal...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load portal data. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!data) {
    return null
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Customer Portal</h1>
        {data.organizationName && (
          <p className="text-sm text-muted-foreground">{data.organizationName}</p>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="subscription" className="space-y-4">
          <SubscriptionTab
            subscriptions={data.subscriptions}
            sessionId={sessionId}
            onUpdate={() => {
              refresh()
              sendMessage({
                type: 'SUBSCRIPTION_UPDATED',
                payload: { subscriptions: data.subscriptions }
              })
            }}
            onCancel={() => {
              refresh()
              sendMessage({ type: 'SUBSCRIPTION_CANCELLED' })
            }}
          />
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <InvoicesTab invoices={data.invoices} />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <PaymentMethodsTab
            paymentMethods={data.paymentMethods}
            sessionId={sessionId}
            onUpdate={() => {
              refresh()
              sendMessage({ type: 'PAYMENT_METHOD_UPDATED' })
            }}
            onAdd={() => {
              refresh()
              sendMessage({ type: 'PAYMENT_METHOD_ADDED' })
            }}
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <SettingsTab
            customer={data.customer}
            usageMetrics={data.usageMetrics}
            sessionId={sessionId}
            onUpdate={refresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Placeholder tab components (will be implemented next)
function SubscriptionTab({ subscriptions, onUpdate, onCancel, sessionId }: any) {
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [subscriptionToCancel, setSubscriptionToCancel] = useState<any>(null)
  const [cancelTiming, setCancelTiming] = useState<'end_of_period' | 'immediate'>('end_of_period')
  const [cancelReason, setCancelReason] = useState('')
  const [cancelFeedback, setCancelFeedback] = useState('')
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  if (subscriptions.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          You don't have any active subscriptions yet.
        </AlertDescription>
      </Alert>
    )
  }

  const handleCancelClick = (subscription: any) => {
    setSubscriptionToCancel(subscription)
    setShowCancelModal(true)
    setCancelTiming('end_of_period')
    setCancelReason('')
    setCancelFeedback('')
    setConfirmChecked(false)
  }

  const handleCancelSubmit = async () => {
    if (!subscriptionToCancel || !confirmChecked) return

    setIsCancelling(true)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/v1/portal/${sessionId}/cancel-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionId: subscriptionToCancel.id,
          timing: cancelTiming,
          reason: cancelReason || undefined,
          feedback: cancelFeedback || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to cancel subscription')
      }

      const result = await response.json()

      // Close modal and refresh
      setShowCancelModal(false)
      setSubscriptionToCancel(null)

      // Call callbacks
      if (onCancel) onCancel()

      // Show success (could add toast notification here)
      console.log('Subscription cancelled:', result)
    } catch (error) {
      console.error('Error cancelling subscription:', error)
      alert('Failed to cancel subscription. Please try again.')
    } finally {
      setIsCancelling(false)
    }
  }

  const getStatusColor = (status: string, cancelAtPeriodEnd: boolean) => {
    if (cancelAtPeriodEnd) return 'bg-yellow-100 text-yellow-800'
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'trialing':
        return 'bg-blue-100 text-blue-800'
      case 'canceled':
        return 'bg-gray-100 text-gray-800'
      case 'past_due':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: string, cancelAtPeriodEnd: boolean) => {
    if (cancelAtPeriodEnd) return 'Cancelling'
    return status
  }

  return (
    <>
      <div className="space-y-4">
        {subscriptions.map((subscription: any) => (
          <div key={subscription.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold">{subscription.product.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {subscription.product.description}
                </p>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(subscription.status, subscription.cancelAtPeriodEnd)}`}>
                {getStatusText(subscription.status, subscription.cancelAtPeriodEnd)}
              </span>
            </div>
            <div className="mt-4 text-sm">
              <p><strong>Price:</strong> ${(subscription.price.amount / 100).toFixed(2)} / {subscription.price.interval}</p>
              <p><strong>Current Period:</strong> {new Date(subscription.currentPeriodStart).toLocaleDateString()} - {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</p>
              {subscription.cancelAtPeriodEnd && (
                <p className="text-yellow-700 mt-2">
                  <strong>Cancels on:</strong> {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            {subscription.features.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold mb-2">Features:</p>
                <ul className="text-sm space-y-1">
                  {subscription.features.map((feature: any) => (
                    <li key={feature.id}>• {feature.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {subscription.status !== 'canceled' && !subscription.cancelAtPeriodEnd && (
              <div className="mt-4 pt-4 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleCancelClick(subscription)}
                >
                  Cancel Subscription
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Cancel Subscription Modal */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Cancel Subscription?</DialogTitle>
            <DialogDescription>
              We're sorry to see you go. Please let us know why you're cancelling.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Timing Selection */}
            <div className="space-y-2">
              <Label>When should we cancel?</Label>
              <RadioGroup value={cancelTiming} onValueChange={(val: any) => setCancelTiming(val)}>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="end_of_period" id="end_of_period" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="end_of_period" className="font-normal cursor-pointer">
                      At end of billing period
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Keep access until {subscriptionToCancel && new Date(subscriptionToCancel.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="immediate" id="immediate" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="immediate" className="font-normal cursor-pointer">
                      Cancel immediately
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Lose access now (no refund)
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">Why are you cancelling? (Optional)</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="too_expensive">Too expensive</SelectItem>
                  <SelectItem value="not_using">Not using enough</SelectItem>
                  <SelectItem value="missing_features">Missing features</SelectItem>
                  <SelectItem value="found_alternative">Found alternative</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Feedback */}
            <div className="space-y-2">
              <Label htmlFor="feedback">Additional feedback (Optional)</Label>
              <Textarea
                id="feedback"
                placeholder="Tell us more about your decision..."
                value={cancelFeedback}
                onChange={(e) => setCancelFeedback(e.target.value)}
                rows={3}
              />
            </div>

            {/* Confirmation */}
            <div className="flex items-start space-x-2">
              <Checkbox
                id="confirm"
                checked={confirmChecked}
                onCheckedChange={(checked: any) => setConfirmChecked(checked)}
              />
              <Label htmlFor="confirm" className="text-sm font-normal cursor-pointer">
                I understand that {cancelTiming === 'immediate' ? 'I will lose access immediately' : 'my subscription will be cancelled'}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelModal(false)}
              disabled={isCancelling}
            >
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelSubmit}
              disabled={!confirmChecked || isCancelling}
            >
              {isCancelling ? 'Cancelling...' : 'Cancel Subscription'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function InvoicesTab({ invoices }: any) {
  if (invoices.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No invoices found.
        </AlertDescription>
      </Alert>
    )
  }

  // Helper function to format currency
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100)
  }

  // Helper function to format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // Helper function to get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800'
      case 'open':
        return 'bg-blue-100 text-blue-800'
      case 'void':
        return 'bg-gray-100 text-gray-800'
      case 'uncollectible':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-4">
      {/* Desktop table view */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 text-sm font-semibold">Invoice</th>
              <th className="text-left p-3 text-sm font-semibold">Date</th>
              <th className="text-left p-3 text-sm font-semibold">Amount</th>
              <th className="text-left p-3 text-sm font-semibold">Status</th>
              <th className="text-left p-3 text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice: any, index: number) => (
              <tr key={invoice.id} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/50'}>
                <td className="p-3 text-sm">
                  {invoice.number || invoice.id.slice(-8)}
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {formatDate(invoice.createdAt)}
                </td>
                <td className="p-3 text-sm font-medium">
                  {formatCurrency(invoice.amount, invoice.currency)}
                </td>
                <td className="p-3">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(invoice.status)}`}>
                    {invoice.status}
                  </span>
                </td>
                <td className="p-3">
                  {invoice.invoicePdf && (
                    <button
                      onClick={() => window.open(invoice.invoicePdf, '_blank')}
                      className="text-sm text-primary hover:underline font-medium"
                    >
                      Download PDF
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {invoices.map((invoice: any) => (
          <div key={invoice.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-sm">
                  {invoice.number || `Invoice ${invoice.id.slice(-8)}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(invoice.createdAt)}
                </p>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(invoice.status)}`}>
                {invoice.status}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <p className="font-medium">
                {formatCurrency(invoice.amount, invoice.currency)}
              </p>
              {invoice.invoicePdf && (
                <button
                  onClick={() => window.open(invoice.invoicePdf, '_blank')}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Download PDF
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PaymentMethodsTab({ paymentMethods, sessionId, onUpdate, onAdd }: any) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripePromise, setStripePromise] = useState<any>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [stripeAccount, setStripeAccount] = useState<string | null>(null)
  const [elements, setElements] = useState<any>(null)
  const [paymentMethodToRemove, setPaymentMethodToRemove] = useState<any>(null)

  // Load Stripe.js when modal opens
  useEffect(() => {
    if (showAddModal && !stripePromise) {
      loadStripe()
    }
  }, [showAddModal])

  const loadStripe = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/v1/portal/${sessionId}/setup-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to create SetupIntent')
      }

      const data = await response.json()
      setClientSecret(data.clientSecret)
      setStripeAccount(data.stripeAccount)

      // Dynamically import Stripe
      const { loadStripe: loadStripeLib } = await import('@stripe/stripe-js')
      const stripe = await loadStripeLib(data.publishableKey, {
        stripeAccount: data.stripeAccount,
      })

      setStripePromise(stripe)
    } catch (err) {
      console.error('Error loading Stripe:', err)
      setError('Failed to initialize payment form')
    }
  }

  const handleAddCard = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!stripePromise || !clientSecret || !elements) {
      setError('Stripe not initialized')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { error: submitError } = await stripePromise.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      })

      if (submitError) {
        setError(submitError.message || 'Failed to add payment method')
        setIsLoading(false)
        return
      }

      // Success - close modal and refresh
      setShowAddModal(false)
      setClientSecret(null)
      setStripePromise(null)
      setElements(null)
      if (onAdd) onAdd()

      console.log('Payment method added successfully')
    } catch (err: any) {
      console.error('Error adding payment method:', err)
      setError(err.message || 'Failed to add payment method')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemove = async (paymentMethodId: string) => {
    if (!confirm('Are you sure you want to remove this payment method?')) {
      return
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(
        `${apiUrl}/v1/portal/${sessionId}/payment-methods/${paymentMethodId}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        throw new Error('Failed to remove payment method')
      }

      if (onUpdate) onUpdate()
      console.log('Payment method removed')
    } catch (err) {
      console.error('Error removing payment method:', err)
      alert('Failed to remove payment method')
    }
  }

  const handleSetDefault = async (paymentMethodId: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(
        `${apiUrl}/v1/portal/${sessionId}/default-payment-method`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ paymentMethodId }),
        }
      )

      if (!response.ok) {
        throw new Error('Failed to set default payment method')
      }

      if (onUpdate) onUpdate()
      console.log('Default payment method updated')
    } catch (err) {
      console.error('Error setting default:', err)
      alert('Failed to set default payment method')
    }
  }

  const getCardIcon = (brand: string) => {
    const icons: Record<string, string> = {
      visa: '💳',
      mastercard: '💳',
      amex: '💳',
      discover: '💳',
    }
    return icons[brand.toLowerCase()] || '💳'
  }

  return (
    <>
      <div className="space-y-4">
        <Button onClick={() => setShowAddModal(true)}>
          Add Payment Method
        </Button>

        {paymentMethods.length === 0 ? (
          <Alert>
            <AlertDescription>
              No payment methods on file. Add a card to manage your subscription.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {paymentMethods.map((pm: any) => (
              <div key={pm.id} className="border rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getCardIcon(pm.brand || 'card')}</span>
                  <div>
                    <p className="font-medium">
                      {pm.brand?.toUpperCase() || 'Card'} •••• {pm.last4}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Expires {pm.expiryMonth}/{pm.expiryYear}
                    </p>
                    {pm.isDefault && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        Default
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!pm.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(pm.id)}
                    >
                      Set Default
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRemove(pm.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Payment Method Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Payment Method</DialogTitle>
            <DialogDescription>
              Add a new card to your account
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddCard}>
            <div className="space-y-4 py-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {clientSecret && stripePromise && (
                <StripePaymentElement
                  stripePromise={stripePromise}
                  clientSecret={clientSecret}
                  onElementsReady={setElements}
                />
              )}

              {!clientSecret && !error && (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddModal(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !clientSecret}>
                {isLoading ? 'Adding...' : 'Add Card'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Stripe Payment Element Component
function StripePaymentElement({ stripePromise, clientSecret, onElementsReady }: any) {
  const [localElements, setLocalElements] = useState<any>(null)

  useEffect(() => {
    if (!stripePromise || !clientSecret) return

    const setupElements = async () => {
      const stripe = await stripePromise
      const elementsInstance = stripe.elements({ clientSecret })
      const paymentElement = elementsInstance.create('payment')
      paymentElement.mount('#payment-element')
      setLocalElements(elementsInstance)

      // Notify parent component that elements are ready
      if (onElementsReady) {
        onElementsReady(elementsInstance)
      }
    }

    setupElements()

    return () => {
      if (localElements) {
        localElements.unmount()
      }
    }
  }, [stripePromise, clientSecret])

  return <div id="payment-element" className="min-h-[200px]"></div>
}

function SettingsTab({ customer, usageMetrics, sessionId, onUpdate }: any) {
  const [name, setName] = useState(customer.name || '')
  const [email, setEmail] = useState(customer.email || '')
  const [street, setStreet] = useState(customer.billingAddress?.street || '')
  const [city, setCity] = useState(customer.billingAddress?.city || '')
  const [state, setState] = useState(customer.billingAddress?.state || '')
  const [postalCode, setPostalCode] = useState(customer.billingAddress?.postal_code || '')
  const [country, setCountry] = useState(customer.billingAddress?.country || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Track changes
  useEffect(() => {
    const hasChanges =
      name !== (customer.name || '') ||
      email !== (customer.email || '') ||
      street !== (customer.billingAddress?.street || '') ||
      city !== (customer.billingAddress?.city || '') ||
      state !== (customer.billingAddress?.state || '') ||
      postalCode !== (customer.billingAddress?.postal_code || '') ||
      country !== (customer.billingAddress?.country || '')

    setIsDirty(hasChanges)
  }, [name, email, street, city, state, postalCode, country, customer])

  const handleSave = async () => {
    setIsSaving(true)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/v1/portal/${sessionId}/customer`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name || undefined,
          email: email || undefined,
          billing_address: {
            street: street || undefined,
            city: city || undefined,
            state: state || undefined,
            postal_code: postalCode || undefined,
            country: country || undefined,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update customer')
      }

      // Refresh portal data
      if (onUpdate) onUpdate()

      setIsDirty(false)
      console.log('Customer updated successfully')
    } catch (error) {
      console.error('Error updating customer:', error)
      alert('Failed to update account details. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 70) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  return (
    <div className="space-y-6">
      {/* Account Details Section */}
      <div className="border rounded-lg p-4">
        <h3 className="font-semibold mb-4">Account Information</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="street">Street Address</Label>
            <Input
              id="street"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="123 Main St"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="12345"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="US"
              maxLength={2}
            />
          </div>

          <div className="pt-4">
            <Button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>

      {/* Usage & Quotas Section */}
      {usageMetrics && usageMetrics.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-4">Usage & Quotas</h3>
          <div className="space-y-4">
            {usageMetrics.map((metric: any) => (
              <div key={metric.featureId} className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium">{metric.featureName}</span>
                  <span className="text-muted-foreground">
                    {metric.used.toLocaleString()} / {metric.limit ? metric.limit.toLocaleString() : '∞'} {metric.unit}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${metric.percentage >= 90 ? 'bg-red-500' : metric.percentage >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                      style={{ width: `${metric.percentage}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${metric.percentage >= 90 ? 'text-red-600' : metric.percentage >= 70 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {metric.percentage}%
                  </span>
                </div>
                {metric.percentage >= 80 && (
                  <p className="text-xs text-yellow-700">
                    ⚠️ Approaching limit
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(!usageMetrics || usageMetrics.length === 0) && (
        <Alert>
          <AlertDescription>
            No usage limits on your current plan.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
