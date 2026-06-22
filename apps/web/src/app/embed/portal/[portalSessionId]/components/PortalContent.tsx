'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import { usePortalData } from '../hooks/usePortalData'
import { useParentMessaging } from '../hooks/useParentMessaging'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loading03Icon } from 'hugeicons-react'
import { SubscriptionTab } from './SubscriptionTab'
import { InvoicesTab } from './InvoicesTab'
import { PaymentMethodsTab } from './PaymentMethodsTab'
import { SettingsTab } from './SettingsTab'

type Tab = 'subscription' | 'invoices' | 'payment' | 'settings'

interface PortalContentProps {
  sessionId: string
  defaultTab?: string
  theme?: string
  accentColor?: string
}

const VALID_TABS: Tab[] = ['subscription', 'invoices', 'payment', 'settings']

export function PortalContent({ sessionId, defaultTab, accentColor }: PortalContentProps) {
  const { data, loading, error, refresh } = usePortalData(sessionId)
  const { sendMessage } = useParentMessaging()
  const [activeTab, setActiveTab] = useState<Tab>(
    VALID_TABS.includes(defaultTab as Tab) ? (defaultTab as Tab) : 'subscription'
  )

  // Send PORTAL_READY when data is loaded
  useEffect(() => {
    if (data && !loading) {
      sendMessage({ type: 'PORTAL_READY' })
    }
  }, [data, loading, sendMessage])

  // Notify parent of height changes
  useEffect(() => {
    const updateHeight = () => {
      sendMessage({ type: 'HEIGHT_CHANGED', payload: { height: document.body.scrollHeight } })
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
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
        <Loading03Icon size={28} className="animate-spin text-gray-400 dark:text-neutral-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
          {error?.message ?? 'Failed to load portal data.'}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsList className="w-full dark:bg-[#0f0f11] dark:border dark:border-[#2e2e30]">
          <TabsTrigger value="subscription" className="flex-1 dark:data-[state=active]:bg-[#1c1c1e] dark:data-[state=active]:text-white dark:text-neutral-400 dark:data-[state=active]:shadow-none">Plan</TabsTrigger>
          <TabsTrigger value="invoices" className="flex-1 dark:data-[state=active]:bg-[#1c1c1e] dark:data-[state=active]:text-white dark:text-neutral-400 dark:data-[state=active]:shadow-none">Invoices</TabsTrigger>
          <TabsTrigger value="payment" className="flex-1 dark:data-[state=active]:bg-[#1c1c1e] dark:data-[state=active]:text-white dark:text-neutral-400 dark:data-[state=active]:shadow-none">Payment</TabsTrigger>
          <TabsTrigger value="settings" className="flex-1 dark:data-[state=active]:bg-[#1c1c1e] dark:data-[state=active]:text-white dark:text-neutral-400 dark:data-[state=active]:shadow-none">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="subscription">
          <SubscriptionTab
            subscriptions={data.subscriptions}
            usageMetrics={data.usageMetrics}
            customer={data.customer}
            sessionId={sessionId}
            accentColor={accentColor}
            churnFlow={data.churnFlow}
            onUpdate={() => {
              refresh()
              sendMessage({ type: 'SUBSCRIPTION_UPDATED', payload: { subscriptions: data.subscriptions } })
            }}
            onCancel={() => {
              refresh()
              sendMessage({ type: 'SUBSCRIPTION_CANCELLED' })
            }}
          />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoicesTab invoices={data.invoices} />
        </TabsContent>

        <TabsContent value="payment">
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

        <TabsContent value="settings">
          <SettingsTab
            customer={data.customer}
            sessionId={sessionId}
            accentColor={accentColor}
            onUpdate={refresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
