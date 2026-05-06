'use client'

import { useEffect, useRef, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  CheckoutProvider,
  CurrencySelectorElement,
  useCheckout,
} from '@stripe/react-stripe-js/checkout'
import { CheckoutForm, getStripeAppearance } from './CheckoutForm'
import { ProductSummary } from './ProductSummary'
import { DiscountCode } from './DiscountCode'
import { HostedCheckout } from './HostedCheckout'
import { useCheckoutSession } from '../hooks/useCheckoutSession'
import { useParentMessaging } from '../hooks/useParentMessaging'

interface CheckoutContentProps {
  sessionId: string
  theme?: 'light' | 'dark' | 'auto'
  accentColor?: string
}

type SessionType = ReturnType<typeof useCheckoutSession>['session']
type NonNullSession = NonNullable<SessionType>

interface PanelHandlers {
  onClose: () => void
  onSuccess: (subscription?: unknown) => void
  onError: (error: Error) => void
  onProcessing: () => void
  onHeightChange: (height: number) => void
}

export function CheckoutContent({ sessionId, theme, accentColor }: CheckoutContentProps) {
  const hasSentReadyMessageRef = useRef(false)
  const { session, loading, error } = useCheckoutSession(sessionId)
  const { sendMessage } = useParentMessaging()

  useEffect(() => {
    hasSentReadyMessageRef.current = false
  }, [sessionId])

  // Notify parent when ready
  useEffect(() => {
    if (session && !hasSentReadyMessageRef.current) {
      sendMessage({ type: 'CHECKOUT_READY' })
      hasSentReadyMessageRef.current = true
    }
  }, [session, sendMessage])

  // Surface load errors to the parent
  useEffect(() => {
    if (error) {
      sendMessage({
        type: 'CHECKOUT_ERROR',
        payload: { error: error.message },
      })
    }
  }, [error, sendMessage])

  // Surface session expiry to the parent
  useEffect(() => {
    if (session?.status === 'expired') {
      sendMessage({
        type: 'CHECKOUT_ERROR',
        payload: { error: 'Checkout session has expired. Please try again.' },
      })
    }
  }, [session?.status, sendMessage])

  const usesCheckoutProvider =
    !!session &&
    session.uiMode !== 'hosted' &&
    (session.checkoutMode === 'adaptive' || session.checkoutMode === 'standard')

  const stripeAccountId = session?.stripeAccountId
  const stripePromise = useMemo(() => {
    if (!usesCheckoutProvider) return null
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
    if (stripeAccountId) {
      return loadStripe(publishableKey, { stripeAccount: stripeAccountId })
    }
    return loadStripe(publishableKey)
  }, [usesCheckoutProvider, stripeAccountId])

  const handlers: PanelHandlers = useMemo(
    () => ({
      onClose: () => sendMessage({ type: 'CHECKOUT_CLOSE' }),
      onSuccess: (subscription) =>
        sendMessage({ type: 'CHECKOUT_SUCCESS', payload: { subscription } }),
      onError: (err) => sendMessage({ type: 'CHECKOUT_ERROR', payload: { error: err.message } }),
      onProcessing: () => sendMessage({ type: 'PROCESSING' }),
      onHeightChange: (height) => sendMessage({ type: 'HEIGHT_CHANGED', payload: { height } }),
    }),
    [sendMessage],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-amber-700">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-500 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2 dark:text-gray-100">Error Loading Checkout</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">{error.message}</p>
        <button
          onClick={handlers.onClose}
          className="px-4 py-2 bg-gray-100 dark:bg-[#242426] rounded-lg hover:bg-gray-200 dark:hover:bg-[#2e2e30] text-sm font-medium dark:text-gray-200"
        >
          Close
        </button>
      </div>
    )
  }

  if (!session) {
    return null
  }

  if (session.uiMode === 'hosted') {
    return (
      <HostedCheckout
        clientSecret={session.clientSecret}
        stripeAccountId={session.stripeAccountId}
      />
    )
  }

  if (usesCheckoutProvider) {
    const isAdaptive = session.checkoutMode === 'adaptive'
    return (
      <CheckoutProvider
        key={`${session.clientSecret}-${theme ?? 'light'}`}
        stripe={stripePromise}
        options={{
          clientSecret: session.clientSecret,
          elementsOptions: { appearance: getStripeAppearance(theme, accentColor) },
          ...(isAdaptive ? { adaptivePricing: { allowed: true } } : {}),
        } as any}
      >
        <CustomCheckoutLayout
          session={session}
          theme={theme}
          accentColor={accentColor}
          handlers={handlers}
        />
      </CheckoutProvider>
    )
  }

  // Trial / upgrade / downgrade / free — no Stripe Checkout Session backbone.
  return (
    <LegacyCheckoutLayout
      session={session}
      theme={theme}
      accentColor={accentColor}
      handlers={handlers}
    />
  )
}

function CustomCheckoutLayout({
  session,
  theme,
  accentColor,
  handlers,
}: {
  session: NonNullSession
  theme?: 'light' | 'dark' | 'auto'
  accentColor?: string
  handlers: PanelHandlers
}) {
  const checkoutResult = useCheckout()
  const checkout = checkoutResult.type === 'success' ? checkoutResult.checkout : null
  const isAdaptive = session.checkoutMode === 'adaptive'

  // Stripe is the source of truth for totals/currency/discount once
  // CheckoutProvider has loaded. Fall back to the BE-provided session
  // values during the brief loading window.
  const liveTotal: number | undefined = (checkout as any)?.total?.total?.minorUnitsAmount
  const liveCurrency: string | undefined = (checkout as any)?.currency
  const liveRecurring: number | undefined =
    (checkout as any)?.recurring?.dueNext?.total?.minorUnitsAmount
  const liveDiscount: number | undefined = (checkout as any)?.total?.discount?.minorUnitsAmount

  const totalAmount = liveTotal ?? session.totalAmount
  const currency = liveCurrency ?? session.currency
  const recurringAmount = liveRecurring
  const discountAmount = liveDiscount ?? 0

  // Derive applied promo state from Stripe's session.
  const appliedDiscounts: any[] = (checkout as any)?.discounts ?? []
  const appliedPromo = appliedDiscounts.find((d: any) => d?.promotionCode)
  const appliedCode: string | null = appliedPromo?.promotionCode?.code ?? null
  const appliedDiscountLabel: string | null = (() => {
    if (!appliedPromo) return null
    const coupon = appliedPromo?.coupon ?? appliedPromo?.promotionCode?.coupon
    if (!coupon) return discountAmount > 0 ? 'Discount applied' : null
    if (coupon.percentOff != null) return `${coupon.percentOff}% off`
    if (coupon.amountOff != null && coupon.currency) {
      return `-${new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: String(coupon.currency).toUpperCase(),
      }).format(coupon.amountOff / 100)}`
    }
    return 'Discount applied'
  })()

  const handleApplyDiscount = async (code: string) => {
    if (!checkout) return { success: false, error: 'Checkout not ready yet' }
    try {
      const result: any = await checkout.applyPromotionCode(code)
      if (result?.type === 'error') {
        return {
          success: false,
          error: result?.error?.message ?? 'Invalid or expired code',
        }
      }
      // Stripe updates the session state in place — totals re-render
      // off the next useCheckout() pass.
      const nextDiscounts: any[] = (result?.checkout?.discounts ?? []) as any[]
      const nextPromo = nextDiscounts.find((d: any) => d?.promotionCode)
      const nextCoupon =
        nextPromo?.coupon ?? nextPromo?.promotionCode?.coupon
      let label = 'Discount applied'
      if (nextCoupon) {
        if (nextCoupon.percentOff != null) label = `${nextCoupon.percentOff}% off`
        else if (nextCoupon.amountOff != null && nextCoupon.currency) {
          label = `-${new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: String(nextCoupon.currency).toUpperCase(),
          }).format(nextCoupon.amountOff / 100)}`
        }
      }
      return { success: true, discountLabel: label }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid or expired code',
      }
    }
  }

  const handleRemoveDiscount = async () => {
    if (!checkout) return
    try {
      await checkout.removePromotionCode()
    } catch {
      // best-effort — UI already resets
    }
  }

  const effectiveSession = useMemo(() => {
    let next = session
    if (liveTotal !== undefined) next = { ...next, totalAmount: liveTotal }
    if (liveRecurring !== undefined) next = { ...next, amount: liveRecurring }
    if (liveCurrency) next = { ...next, currency: liveCurrency }
    return next
  }, [session, liveTotal, liveRecurring, liveCurrency])

  return (
    <CheckoutShell
      session={session}
      effectiveSession={effectiveSession}
      handlers={handlers}
      theme={theme}
      accentColor={accentColor}
      totalAmount={totalAmount}
      currency={currency}
      recurringAmount={recurringAmount}
      discountAmount={discountAmount}
      onApplyDiscount={handleApplyDiscount}
      onRemoveDiscount={handleRemoveDiscount}
      appliedCode={appliedCode}
      appliedDiscountLabel={appliedDiscountLabel}
      showCurrencySelector={isAdaptive}
    />
  )
}

function LegacyCheckoutLayout({
  session,
  theme,
  accentColor,
  handlers,
}: {
  session: NonNullSession
  theme?: 'light' | 'dark' | 'auto'
  accentColor?: string
  handlers: PanelHandlers
}) {
  // Trial / upgrade / downgrade / free — no live promo wiring. The
  // CheckoutForm variant for these modes handles its own confirm flow.
  return (
    <CheckoutShell
      session={session}
      effectiveSession={session}
      handlers={handlers}
      theme={theme}
      accentColor={accentColor}
      totalAmount={session.totalAmount}
      currency={session.currency}
      recurringAmount={undefined}
      discountAmount={session.discountAmount ?? 0}
      // Promo apply/remove not supported for these modes (BE rejects them
      // for upgrade/downgrade/free; trial discounts are pre-applied via
      // the SDK couponCode at session-create).
      onApplyDiscount={undefined}
      onRemoveDiscount={undefined}
      appliedCode={null}
      appliedDiscountLabel={null}
      showCurrencySelector={false}
    />
  )
}

interface CheckoutShellProps {
  session: NonNullSession
  effectiveSession: NonNullSession
  handlers: PanelHandlers
  theme?: 'light' | 'dark' | 'auto'
  accentColor?: string
  totalAmount: number
  currency: string
  recurringAmount?: number
  discountAmount: number
  onApplyDiscount?: (code: string) => Promise<{ success: boolean; discountLabel?: string; error?: string }>
  onRemoveDiscount?: () => Promise<void>
  appliedCode: string | null
  appliedDiscountLabel: string | null
  showCurrencySelector: boolean
}

function CheckoutShell({
  session,
  effectiveSession,
  handlers,
  theme,
  accentColor,
  totalAmount,
  currency,
  recurringAmount,
  discountAmount,
  onApplyDiscount,
  onRemoveDiscount,
  appliedCode,
  appliedDiscountLabel,
  showCurrencySelector,
}: CheckoutShellProps) {
  const leftPanel = (
    <div
      className="w-[50%] flex-shrink-0 bg-[#f3f4f6] dark:bg-[#1c1c1e] flex flex-col p-8 overflow-y-auto checkout-enter"
      style={{ animationFillMode: 'forwards' }}
    >
      <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 dark:text-gray-500 uppercase mb-2">
        Order Summary
      </p>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{session.product?.name}</h1>
      {session.product?.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{session.product.description}</p>
      )}
      <div className="mt-6">
        <ProductSummary
          product={session.product}
          amount={session.amount}
          currency={session.currency}
          discountAmount={discountAmount > 0 ? discountAmount : session.discountAmount}
          taxAmount={session.taxAmount}
          totalAmount={totalAmount}
          proration={session.proration}
          displayCurrency={currency !== session.currency ? currency : undefined}
          trialDays={session.trialDays}
          displayRecurringAmount={recurringAmount}
        />
      </div>
      {showCurrencySelector && (
        <div className="mt-4">
          <label className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 dark:text-gray-500 uppercase mb-2 block">
            Currency
          </label>
          <CurrencySelectorElement />
        </div>
      )}
      {onApplyDiscount && onRemoveDiscount && (
        <div className="mt-4">
          <DiscountCode
            onApply={onApplyDiscount}
            onRemove={onRemoveDiscount}
            appliedCode={appliedCode}
            appliedDiscountLabel={appliedDiscountLabel}
          />
        </div>
      )}
    </div>
  )

  const rightPanel = (
    <div
      className="flex-1 bg-white dark:bg-[#141415] flex flex-col p-8 relative overflow-y-auto checkout-enter-delayed"
      style={{ animationFillMode: 'forwards' }}
    >
      <button
        onClick={handlers.onClose}
        className="absolute top-5 right-5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
        aria-label="Close"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 dark:text-gray-500 uppercase mb-1">
        {session.checkoutMode === 'upgrade' ? 'Confirm Upgrade' : 'Payment Details'}
      </p>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        {session.checkoutMode === 'upgrade' ? 'Review your plan change' : 'Complete your purchase'}
      </h2>

      <CheckoutForm
        key={`${session.clientSecret}-${theme ?? 'light'}`}
        session={effectiveSession}
        theme={theme}
        accentColor={accentColor}
        onSuccess={(subscription) => handlers.onSuccess(subscription)}
        onError={handlers.onError}
        onProcessing={handlers.onProcessing}
        onHeightChange={handlers.onHeightChange}
      />
    </div>
  )

  return (
    <>
      <style>{`
        @keyframes checkoutSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .checkout-enter {
          animation: checkoutSlideUp 200ms ease-out forwards;
        }
        .checkout-enter-delayed {
          opacity: 0;
          animation: checkoutSlideUp 200ms ease-out 50ms forwards;
        }
      `}</style>
      <div className="bg-white dark:bg-[#141415] h-screen flex overflow-hidden rounded-2xl">
        {leftPanel}
        {rightPanel}
      </div>
    </>
  )
}
