'use client'

import { useEffect, useState } from 'react'
import { usePortalData } from '../hooks/usePortalData'
import { useParentMessaging } from '../hooks/useParentMessaging'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'

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
          <SettingsTab customer={data.customer} onUpdate={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Placeholder tab components (will be implemented next)
function SubscriptionTab({ subscriptions, onUpdate, onCancel }: any) {
  if (subscriptions.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          You don't have any active subscriptions yet.
        </AlertDescription>
      </Alert>
    )
  }

  return (
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
            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
              {subscription.status}
            </span>
          </div>
          <div className="mt-4 text-sm">
            <p><strong>Price:</strong> ${(subscription.price.amount / 100).toFixed(2)} / {subscription.price.interval}</p>
            <p><strong>Current Period:</strong> {new Date(subscription.currentPeriodStart).toLocaleDateString()} - {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</p>
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
        </div>
      ))}
    </div>
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

  return <div>Invoices Tab (Coming soon)</div>
}

function PaymentMethodsTab({ paymentMethods, onUpdate, onAdd }: any) {
  if (paymentMethods.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No payment methods on file.
        </AlertDescription>
      </Alert>
    )
  }

  return <div>Payment Methods Tab (Coming soon)</div>
}

function SettingsTab({ customer, onUpdate }: any) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold mb-2">Account Information</h3>
        <div className="space-y-2 text-sm">
          <p><strong>Email:</strong> {customer.email || 'Not provided'}</p>
          <p><strong>Name:</strong> {customer.name || 'Not provided'}</p>
        </div>
      </div>
    </div>
  )
}
