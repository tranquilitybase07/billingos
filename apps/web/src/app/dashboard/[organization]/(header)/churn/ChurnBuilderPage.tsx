'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Message01Icon,
  GiftIcon,
  Shield01Icon,
  ViewIcon,
  CheckmarkCircle01Icon,
  Settings01Icon,
  PlusSignIcon,
  Delete02Icon,
} from 'hugeicons-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { CardFlat } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PillTabs, PillTabsList, PillTabsTrigger } from '@/components/atoms/PillTabs'
import { useToast } from '@/hooks/use-toast'
import { ChurnFlowBody } from '@/components/churn/ChurnFlow'
import type { ChurnScreen, ChurnOutcome } from '@/components/churn/machine'
import type {
  ChurnFlowConfig,
  ChurnStep,
  ConfirmStep,
  FeedbackStep,
  LossAversionStep,
  SurveyStep,
} from '@/components/churn/types'
import {
  useChurnFlows,
  useCreateChurnFlow,
  useUpdateChurnFlow,
  type ChurnFlow,
} from '@/hooks/queries/churn-flows'
import { useProducts } from '@/hooks/queries/products'

type StepId = 'survey' | 'offer' | 'lossAversion' | 'feedback' | 'confirm'
type ConfirmPreview = 'confirm' | 'saved' | 'cancelled'

interface OfferDraft {
  enabled: boolean
  kind: 'discount' | 'pause' | 'downgrade'
  percentOff: number
  durationInMonths: number
  pauseMonths: number
  /** Pinned downgrade target price id; '' = auto (next-cheaper plan). */
  downgradeTargetPriceId: string
}

interface AvailablePlan {
  priceId: string
  productName: string
  amount: number
  currency: string
  interval: string
}

interface ReasonDraft {
  key: string
  label: string
  offer: OfferDraft
}

interface FeedbackDraft {
  enabled: boolean
  title: string
  placeholder: string
  required: boolean
  minChars: number
}

interface FlowDraft {
  id?: string
  name: string
  enabled: boolean
  surveyTitle: string
  surveySubheading: string
  reasons: ReasonDraft[]
  offerEnabled: boolean
  lossEnabled: boolean
  lossTitle: string
  features: string[]
  feedback: FeedbackDraft
  confirmTitle: string
  allowImmediate: boolean
  savedHeading: string
  savedMessage: string
  cancelledHeading: string
  cancelledMessage: string
  allowRepeatDiscount: boolean
  allowRepeatPause: boolean
  allowRepeatDowngrade: boolean
}

const DEFAULT_OFFER: OfferDraft = {
  enabled: false,
  kind: 'discount',
  percentOff: 20,
  durationInMonths: 3,
  pauseMonths: 0,
  downgradeTargetPriceId: '',
}

const DEFAULT_DRAFT: FlowDraft = {
  name: 'Default cancel flow',
  enabled: false,
  surveyTitle: 'Before you go…',
  surveySubheading: "Help us understand why you're leaving.",
  reasons: [
    { key: 'too_expensive', label: 'Too expensive', offer: { ...DEFAULT_OFFER, enabled: true } },
    { key: 'not_using', label: 'Not using it enough', offer: { ...DEFAULT_OFFER, kind: 'pause' } },
    { key: 'missing_features', label: 'Missing features', offer: { ...DEFAULT_OFFER } },
    { key: 'found_alternative', label: 'Found an alternative', offer: { ...DEFAULT_OFFER } },
    { key: 'other', label: 'Other', offer: { ...DEFAULT_OFFER } },
  ],
  offerEnabled: true,
  lossEnabled: true,
  lossTitle: 'Are you sure you want to lose these?',
  features: ['Your saved data', 'Premium features', 'Priority support'],
  feedback: {
    enabled: true,
    title: 'Any final thoughts?',
    placeholder: 'Tell us about your experience...',
    required: false,
    minChars: 20,
  },
  confirmTitle: 'Cancel subscription?',
  allowImmediate: true,
  savedHeading: "You're all set",
  savedMessage: 'Your subscription has been updated. Thanks for sticking with us!',
  cancelledHeading: 'Subscription cancelled',
  cancelledMessage:
    'Your access will remain active until the end of your current billing period.',
  allowRepeatDiscount: false,
  allowRepeatPause: false,
  allowRepeatDowngrade: false,
}

function draftFromFlow(flow: ChurnFlow): FlowDraft {
  const steps = (flow.steps ?? []) as ChurnStep[]
  const survey = steps.find((s): s is SurveyStep => s.type === 'survey')
  const loss = steps.find((s): s is LossAversionStep => s.type === 'lossAversion')
  const feedback = steps.find((s): s is FeedbackStep => s.type === 'feedback')
  const confirm = steps.find((s): s is ConfirmStep => s.type === 'confirm')
  const legacyLosses = confirm?.losses ?? []
  return {
    id: flow.id,
    name: flow.name,
    enabled: flow.enabled,
    surveyTitle: survey?.title ?? DEFAULT_DRAFT.surveyTitle,
    surveySubheading: survey?.subheading ?? DEFAULT_DRAFT.surveySubheading,
    reasons:
      survey?.reasons.map((r) => ({
        key: r.key,
        label: r.label,
        offer: {
          enabled:
            r.offer?.type === 'discount' ||
            r.offer?.type === 'pause' ||
            r.offer?.type === 'downgrade',
          kind:
            r.offer?.type === 'pause'
              ? 'pause'
              : r.offer?.type === 'downgrade'
                ? 'downgrade'
                : 'discount',
          percentOff:
            r.offer?.type === 'discount' ? (r.offer.percentOff ?? 20) : 20,
          durationInMonths:
            r.offer?.type === 'discount' ? (r.offer.durationInMonths ?? 0) : 3,
          pauseMonths:
            r.offer?.type === 'pause' ? (r.offer.durationInMonths ?? 0) : 0,
          downgradeTargetPriceId:
            r.offer?.type === 'downgrade' ? (r.offer.targetPriceId ?? '') : '',
        } satisfies OfferDraft,
      })) ?? DEFAULT_DRAFT.reasons,
    offerEnabled: flow.settings?.offerEnabled ?? true,
    // Fall back to legacy confirm.losses so older flows surface as loss-aversion.
    lossEnabled: loss
      ? loss.enabled !== false
      : legacyLosses.length > 0,
    lossTitle: loss?.title ?? DEFAULT_DRAFT.lossTitle,
    features: loss?.features ?? (legacyLosses.length ? legacyLosses : DEFAULT_DRAFT.features),
    feedback: {
      enabled: feedback ? feedback.enabled !== false : DEFAULT_DRAFT.feedback.enabled,
      title: feedback?.title ?? DEFAULT_DRAFT.feedback.title,
      placeholder: feedback?.placeholder ?? DEFAULT_DRAFT.feedback.placeholder,
      required: feedback?.required ?? DEFAULT_DRAFT.feedback.required,
      minChars: feedback?.minChars ?? DEFAULT_DRAFT.feedback.minChars,
    },
    confirmTitle: confirm?.title ?? DEFAULT_DRAFT.confirmTitle,
    allowImmediate: confirm?.allowImmediate ?? true,
    savedHeading: confirm?.savedHeading ?? DEFAULT_DRAFT.savedHeading,
    savedMessage: confirm?.savedMessage ?? DEFAULT_DRAFT.savedMessage,
    cancelledHeading: confirm?.cancelledHeading ?? DEFAULT_DRAFT.cancelledHeading,
    cancelledMessage: confirm?.cancelledMessage ?? DEFAULT_DRAFT.cancelledMessage,
    allowRepeatDiscount: flow.settings?.allowRepeatDiscount ?? false,
    allowRepeatPause: flow.settings?.allowRepeatPause ?? false,
    allowRepeatDowngrade: flow.settings?.allowRepeatDowngrade ?? false,
  }
}

function buildSteps(draft: FlowDraft): ChurnStep[] {
  const survey: SurveyStep = {
    id: 'survey',
    type: 'survey',
    title: draft.surveyTitle,
    subheading: draft.surveySubheading,
    reasons: draft.reasons
      .filter((r) => r.label.trim())
      .map((r) => ({
        key: r.key,
        label: r.label.trim(),
        ...(r.offer.enabled
          ? {
            offer:
              r.offer.kind === 'pause'
                ? {
                  type: 'pause' as const,
                  ...(r.offer.pauseMonths > 0
                    ? { durationInMonths: r.offer.pauseMonths }
                    : {}),
                }
                : r.offer.kind === 'downgrade'
                  ? {
                    type: 'downgrade' as const,
                    ...(r.offer.downgradeTargetPriceId
                      ? { targetPriceId: r.offer.downgradeTargetPriceId }
                      : {}),
                  }
                  : {
                    type: 'discount' as const,
                    // Clamp to a sane 1–100 range; the input is client-side only.
                    percentOff: Math.min(100, Math.max(1, r.offer.percentOff)),
                    ...(r.offer.durationInMonths > 0
                      ? { durationInMonths: r.offer.durationInMonths }
                      : {}),
                  },
          }
          : {}),
      })),
  }
  const lossAversion: LossAversionStep = {
    id: 'lossAversion',
    type: 'lossAversion',
    enabled: draft.lossEnabled,
    title: draft.lossTitle,
    features: draft.features.map((f) => f.trim()).filter(Boolean),
  }
  const feedback: FeedbackStep = {
    id: 'feedback',
    type: 'feedback',
    enabled: draft.feedback.enabled,
    title: draft.feedback.title,
    placeholder: draft.feedback.placeholder,
    required: draft.feedback.required,
    minChars: draft.feedback.minChars,
  }
  const confirm: ConfirmStep = {
    id: 'confirm',
    type: 'confirm',
    title: draft.confirmTitle,
    allowImmediate: draft.allowImmediate,
    savedHeading: draft.savedHeading,
    savedMessage: draft.savedMessage,
    cancelledHeading: draft.cancelledHeading,
    cancelledMessage: draft.cancelledMessage,
  }
  return [survey, lossAversion, feedback, confirm]
}

function settingsFromDraft(draft: FlowDraft) {
  return {
    allowRepeatDiscount: draft.allowRepeatDiscount,
    allowRepeatPause: draft.allowRepeatPause,
    allowRepeatDowngrade: draft.allowRepeatDowngrade,
    offerEnabled: draft.offerEnabled,
  }
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100)
}

const PREVIEW_SUBSCRIPTION = {
  planName: 'Pro',
  amount: 2900,
  currency: 'usd',
  interval: 'month',
  renewalDate: new Date().toISOString(),
}

const STEPS: {
  id: StepId
  label: string
  desc: string
  icon: typeof Message01Icon
  toggle?: 'offerEnabled' | 'lossEnabled' | 'feedbackEnabled'
}[] = [
    {
      id: 'survey',
      label: 'Cancel reason survey',
      desc: 'Ask why customers are leaving',
      icon: Message01Icon,
    },
    {
      id: 'offer',
      label: 'Retention offer',
      desc: 'Present targeted save offers',
      icon: GiftIcon,
      toggle: 'offerEnabled',
    },
    {
      id: 'lossAversion',
      label: 'Loss aversion',
      desc: 'Show what they will lose',
      icon: Shield01Icon,
      toggle: 'lossEnabled',
    },
    {
      id: 'feedback',
      label: 'Feedback',
      desc: 'Collect open-ended feedback',
      icon: ViewIcon,
      toggle: 'feedbackEnabled',
    },
    {
      id: 'confirm',
      label: 'Confirmation',
      desc: 'Cancel prompt & final states',
      icon: CheckmarkCircle01Icon,
    },
  ]

export default function ChurnBuilderPage({
  organizationId,
  embedded = false,
}: {
  organizationId: string
  embedded?: boolean
}) {
  const { toast } = useToast()
  const { data: flows, isLoading } = useChurnFlows(organizationId)
  const createFlow = useCreateChurnFlow(organizationId)
  const updateFlow = useUpdateChurnFlow(organizationId)
  const { data: productsData } = useProducts(organizationId, {
    includePrices: true,
    is_archived: false,
    limit: 100,
  })

  const availablePlans = useMemo<AvailablePlan[]>(() => {
    const products = productsData?.items ?? []
    const plans: AvailablePlan[] = []
    for (const product of products) {
      if (product.is_archived) continue
      if (product.version_status === 'superseded') continue
      for (const price of product.prices ?? []) {
        if (
          price.amount_type !== 'fixed' ||
          !price.recurring_interval ||
          !price.stripe_price_id ||
          !price.price_amount ||
          price.price_amount <= 0
        )
          continue
        plans.push({
          priceId: price.id,
          productName: product.name,
          amount: price.price_amount,
          currency: price.price_currency ?? 'usd',
          interval: price.recurring_interval,
        })
      }
    }
    return plans.sort((a, b) => a.amount - b.amount)
  }, [productsData])

  const [draft, setDraft] = useState<FlowDraft>(DEFAULT_DRAFT)
  const [hydrated, setHydrated] = useState(false)
  const [activeStep, setActiveStep] = useState<StepId>('survey')
  const [confirmPreview, setConfirmPreview] = useState<ConfirmPreview>('confirm')
  const [newReason, setNewReason] = useState('')
  const [newFeature, setNewFeature] = useState('')

  /* eslint-disable react-hooks/set-state-in-effect -- intentional: hydrate the draft once when the async flow loads */
  useEffect(() => {
    if (!hydrated && flows) {
      if (flows.length > 0) setDraft(draftFromFlow(flows[0]))
      setHydrated(true)
    }
  }, [flows, hydrated])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Mirror the server's getConfig enrichment locally so the live preview shows the
  // real target plan + price for a pinned downgrade.
  const previewSteps = useMemo<ChurnStep[]>(() => {
    const steps = buildSteps(draft)
    return steps.map((step) => {
      if (step.type !== 'survey') return step
      return {
        ...step,
        reasons: step.reasons.map((reason) => {
          const offer = reason.offer
          if (offer?.type !== 'downgrade' || !offer.targetPriceId) return reason
          const plan = availablePlans.find((p) => p.priceId === offer.targetPriceId)
          if (!plan) return reason
          return {
            ...reason,
            offer: {
              ...offer,
              targetPreview: {
                planName: plan.productName,
                amount: plan.amount,
                currency: plan.currency,
                interval: plan.interval,
              },
            },
          }
        }),
      }
    })
  }, [draft, availablePlans])

  const previewConfig: ChurnFlowConfig = useMemo(
    () => ({
      id: 'preview',
      name: draft.name,
      enabled: true,
      steps: previewSteps,
      settings: { offerEnabled: draft.offerEnabled },
    }),
    [draft.name, draft.offerEnabled, previewSteps],
  )
  // Remount only when switching which screen is previewed — config edits flow in
  // via the `config` prop and `previewGoTo`, so typing doesn't reset the preview.
  const previewKey = `${activeStep}:${confirmPreview}`

  const { previewScreen, previewOutcome } = useMemo<{
    previewScreen: ChurnScreen
    previewOutcome?: ChurnOutcome
  }>(() => {
    if (activeStep === 'confirm') {
      if (confirmPreview === 'saved')
        return { previewScreen: 'success', previewOutcome: 'saved' }
      if (confirmPreview === 'cancelled')
        return { previewScreen: 'success', previewOutcome: 'canceled' }
      return { previewScreen: 'confirm' }
    }
    return { previewScreen: activeStep }
  }, [activeStep, confirmPreview])

  const saving = createFlow.isPending || updateFlow.isPending

  const persist = async (overrides?: Partial<FlowDraft>) => {
    const merged = { ...draft, ...overrides }
    const input = {
      name: merged.name.trim() || 'Cancel flow',
      enabled: merged.enabled,
      steps: buildSteps(merged),
      settings: settingsFromDraft(merged),
    }
    if (merged.id) {
      await updateFlow.mutateAsync({ id: merged.id, input })
      return merged.id
    }
    const created = await createFlow.mutateAsync(input)
    setDraft((d) => ({ ...d, id: created.id }))
    return created.id
  }

  const handleSave = async () => {
    try {
      await persist()
      toast({ title: 'Saved', description: 'Your churn flow has been saved.' })
    } catch {
      toast({
        title: 'Could not save',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleToggleEnabled = async (v: boolean) => {
    setDraft((d) => ({ ...d, enabled: v }))
    try {
      await persist({ enabled: v })
      toast({ title: v ? 'Flow is live' : 'Flow turned off' })
    } catch {
      setDraft((d) => ({ ...d, enabled: !v }))
      toast({
        title: 'Could not update',
        description: 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const updateReason = (i: number, patch: Partial<ReasonDraft>) =>
    setDraft((d) => ({
      ...d,
      reasons: d.reasons.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }))

  const updateOffer = (i: number, patch: Partial<OfferDraft>) =>
    setDraft((d) => ({
      ...d,
      reasons: d.reasons.map((r, idx) =>
        idx === i ? { ...r, offer: { ...r.offer, ...patch } } : r,
      ),
    }))

  const addReason = () => {
    const label = newReason.trim()
    if (!label) return
    setDraft((d) => ({
      ...d,
      reasons: [
        ...d.reasons,
        {
          key: `reason_${d.reasons.length + 1}_${Date.now().toString(36)}`,
          label,
          offer: { ...DEFAULT_OFFER },
        },
      ],
    }))
    setNewReason('')
  }

  const removeReason = (i: number) =>
    setDraft((d) => ({ ...d, reasons: d.reasons.filter((_, idx) => idx !== i) }))

  const updateFeature = (i: number, value: string) =>
    setDraft((d) => ({
      ...d,
      features: d.features.map((f, idx) => (idx === i ? value : f)),
    }))

  const addFeature = () => {
    const value = newFeature.trim()
    if (!value) return
    setDraft((d) => ({ ...d, features: [...d.features, value] }))
    setNewFeature('')
  }

  const removeFeature = (i: number) =>
    setDraft((d) => ({ ...d, features: d.features.filter((_, idx) => idx !== i) }))

  const toggleValue = (key: NonNullable<(typeof STEPS)[number]['toggle']>) =>
    key === 'offerEnabled'
      ? draft.offerEnabled
      : key === 'lossEnabled'
        ? draft.lossEnabled
        : draft.feedback.enabled

  const setToggle = (
    key: NonNullable<(typeof STEPS)[number]['toggle']>,
    v: boolean,
  ) =>
    setDraft((d) =>
      key === 'offerEnabled'
        ? { ...d, offerEnabled: v }
        : key === 'lossEnabled'
          ? { ...d, lossEnabled: v }
          : { ...d, feedback: { ...d.feedback, enabled: v } },
    )

  return (
    <div
      className={`flex flex-col ${embedded ? 'h-full' : 'p-6 h-[calc(100vh-3rem)]'}`}
    >
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left: steps list */}
        <CardFlat className="flex w-64 shrink-0 flex-col overflow-hidden p-0">
          <div className="flex items-start justify-between gap-2 border-b border-border p-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Flow steps</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The order customers experience
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Switch
                id="flow-enabled"
                checked={draft.enabled}
                disabled={saving}
                onCheckedChange={handleToggleEnabled}
                className="scale-90"
              />
              <Label
                htmlFor="flow-enabled"
                className="cursor-pointer text-xs text-muted-foreground"
              >
                {draft.enabled ? 'Live' : 'Off'}
              </Label>
            </div>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
            {STEPS.map((step) => {
              const Icon = step.icon
              const isActive = activeStep === step.id
              const isOn = step.toggle ? toggleValue(step.toggle) : true
              return (
                <div
                  key={step.id}
                  className={`flex items-center rounded-lg transition-colors ${isActive
                      ? 'bg-muted ring-1 ring-border'
                      : 'hover:bg-muted/50'
                    } ${step.toggle && !isOn ? 'opacity-50' : ''}`}
                >
                  <button
                    onClick={() => setActiveStep(step.id)}
                    className="flex min-w-0 flex-1 items-start gap-2.5 p-2.5 text-left"
                  >
                    <Icon
                      size={16}
                      className={`mt-0.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{step.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {step.desc}
                      </p>
                    </div>
                  </button>
                  {step.toggle && (
                    <Switch
                      className="mr-3 scale-90"
                      checked={isOn}
                      aria-label={`Toggle ${step.label}`}
                      onCheckedChange={(v) => setToggle(step.toggle!, v)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </CardFlat>

        {/* Center: live preview */}
        <div
          className="relative flex flex-1 items-center justify-center overflow-y-auto rounded-xl border border-border bg-muted/30 p-8"
          style={{
            backgroundImage:
              'radial-gradient(var(--border) 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
        >
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Live preview
          </div>
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <ChurnFlowBody
                key={previewKey}
                config={previewConfig}
                subscription={PREVIEW_SUBSCRIPTION}
                previewScreen={previewScreen}
                previewOutcome={previewOutcome}
                onApplyOffer={async () => 'saved' as const}
                onCancel={async () => { }}
                onClose={() => { }}
              />
            </div>
          </div>
        </div>

        {/* Right: configuration */}
        <CardFlat className="flex w-80 shrink-0 flex-col overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-border p-4">
            <Settings01Icon size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Configuration</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-5"
            >
              {activeStep === 'survey' && (
                <>
                  <Field label="Heading">
                    <Input
                      value={draft.surveyTitle}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, surveyTitle: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Subheading">
                    <Textarea
                      rows={2}
                      className="resize-none"
                      value={draft.surveySubheading}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          surveySubheading: e.target.value,
                        }))
                      }
                    />
                  </Field>
                  <div className="space-y-2">
                    <Label className="text-sm">Cancellation reasons</Label>
                    <div className="space-y-1.5">
                      {draft.reasons.map((reason, i) => (
                        <div
                          key={reason.key}
                          className="group flex items-center gap-1.5"
                        >
                          <Input
                            value={reason.label}
                            placeholder="Reason label"
                            onChange={(e) =>
                              updateReason(i, { label: e.target.value })
                            }
                          />
                          <button
                            onClick={() => removeReason(i)}
                            aria-label="Remove reason"
                            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                          >
                            <Delete02Icon size={16} />
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center gap-1.5 pt-1">
                        <Input
                          value={newReason}
                          placeholder="New reason…"
                          onChange={(e) => setNewReason(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addReason()}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={addReason}
                        >
                          <PlusSignIcon size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeStep === 'offer' && (
                <>
                  <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                    Offers are shown conditionally based on the cancel reason the
                    customer selects.
                  </p>
                  {draft.reasons.map((reason, i) => (
                    <div
                      key={reason.key}
                      className="space-y-3 rounded-lg bg-muted/40 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          If: {reason.label || 'Untitled'}
                        </span>
                        <Switch
                          className="scale-90"
                          checked={reason.offer.enabled}
                          aria-label="Toggle offer"
                          onCheckedChange={(v) => updateOffer(i, { enabled: v })}
                        />
                      </div>
                      {reason.offer.enabled && (
                        <div className="space-y-3">
                          <PillTabs
                            layoutId={`offer-kind-${reason.key}`}
                            value={reason.offer.kind}
                            onValueChange={(v) =>
                              updateOffer(i, { kind: v as OfferDraft['kind'] })
                            }
                          >
                            <PillTabsList>
                              <PillTabsTrigger value="discount">
                                Discount
                              </PillTabsTrigger>
                              <PillTabsTrigger value="pause">Pause</PillTabsTrigger>
                              <PillTabsTrigger value="downgrade">
                                Downgrade
                              </PillTabsTrigger>
                            </PillTabsList>
                          </PillTabs>
                          {reason.offer.kind === 'discount' ? (
                            <div className="grid grid-cols-2 gap-3">
                              <Field label="Percent off" small>
                                <Input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={reason.offer.percentOff}
                                  onChange={(e) =>
                                    updateOffer(i, {
                                      percentOff: Number(e.target.value) || 0,
                                    })
                                  }
                                />
                              </Field>
                              <Field label="Months (0 = once)" small>
                                <Input
                                  type="number"
                                  min={0}
                                  value={reason.offer.durationInMonths}
                                  onChange={(e) =>
                                    updateOffer(i, {
                                      durationInMonths: Number(e.target.value) || 0,
                                    })
                                  }
                                />
                              </Field>
                            </div>
                          ) : reason.offer.kind === 'pause' ? (
                            <Field label="Resume after months (0 = indefinite)" small>
                              <Input
                                type="number"
                                min={0}
                                value={reason.offer.pauseMonths}
                                onChange={(e) =>
                                  updateOffer(i, {
                                    pauseMonths: Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </Field>
                          ) : (
                            <Field label="Downgrade to" small>
                              <Select
                                value={reason.offer.downgradeTargetPriceId || 'auto'}
                                onValueChange={(v) =>
                                  updateOffer(i, {
                                    downgradeTargetPriceId: v === 'auto' ? '' : v,
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto">
                                    Auto — next cheaper plan
                                  </SelectItem>
                                  {availablePlans.map((plan) => (
                                    <SelectItem key={plan.priceId} value={plan.priceId}>
                                      {plan.productName} ·{' '}
                                      {formatMoney(plan.amount, plan.currency)}/
                                      {plan.interval}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Field>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}

              {activeStep === 'lossAversion' && (
                <>
                  <Field label="Heading">
                    <Input
                      value={draft.lossTitle}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, lossTitle: e.target.value }))
                      }
                    />
                  </Field>
                  <div className="space-y-2">
                    <Label className="text-sm">Features they&apos;ll lose</Label>
                    <div className="space-y-1.5">
                      {draft.features.map((feature, i) => (
                        <div key={i} className="group flex items-center gap-1.5">
                          <Input
                            value={feature}
                            onChange={(e) => updateFeature(i, e.target.value)}
                          />
                          <button
                            onClick={() => removeFeature(i)}
                            aria-label="Remove feature"
                            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                          >
                            <Delete02Icon size={16} />
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center gap-1.5 pt-1">
                        <Input
                          value={newFeature}
                          placeholder="New feature…"
                          onChange={(e) => setNewFeature(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addFeature()}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={addFeature}
                        >
                          <PlusSignIcon size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeStep === 'feedback' && (
                <>
                  <Field label="Heading">
                    <Input
                      value={draft.feedback.title}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          feedback: { ...d.feedback, title: e.target.value },
                        }))
                      }
                    />
                  </Field>
                  <Field label="Placeholder text">
                    <Input
                      value={draft.feedback.placeholder}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          feedback: { ...d.feedback, placeholder: e.target.value },
                        }))
                      }
                    />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="feedback-required"
                      checked={draft.feedback.required}
                      onCheckedChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          feedback: { ...d.feedback, required: v },
                        }))
                      }
                    />
                    <Label htmlFor="feedback-required" className="cursor-pointer text-sm">
                      Make feedback required
                    </Label>
                  </div>
                  {draft.feedback.required && (
                    <Field label="Minimum characters" small>
                      <Input
                        type="number"
                        min={1}
                        value={draft.feedback.minChars}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            feedback: {
                              ...d.feedback,
                              minChars: parseInt(e.target.value, 10) || 0,
                            },
                          }))
                        }
                      />
                    </Field>
                  )}
                </>
              )}

              {activeStep === 'confirm' && (
                <>
                  <PillTabs
                    layoutId="confirm-preview"
                    value={confirmPreview}
                    onValueChange={(v) => setConfirmPreview(v as ConfirmPreview)}
                  >
                    <PillTabsList>
                      <PillTabsTrigger value="confirm">Prompt</PillTabsTrigger>
                      <PillTabsTrigger value="saved">Saved</PillTabsTrigger>
                      <PillTabsTrigger value="cancelled">Cancelled</PillTabsTrigger>
                    </PillTabsList>
                  </PillTabs>

                  {confirmPreview === 'confirm' && (
                    <>
                      <Field label="Heading">
                        <Input
                          value={draft.confirmTitle}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, confirmTitle: e.target.value }))
                          }
                        />
                      </Field>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="allow-immediate"
                          checked={draft.allowImmediate}
                          onCheckedChange={(v) =>
                            setDraft((d) => ({ ...d, allowImmediate: v }))
                          }
                        />
                        <Label htmlFor="allow-immediate" className="cursor-pointer text-sm">
                          Allow immediate cancellation
                        </Label>
                      </div>
                      <div className="space-y-3 border-t border-border pt-4">
                        <p className="text-xs font-medium text-muted-foreground">
                          Save offer policy
                        </p>
                        <RepeatToggle
                          id="allow-repeat-discount"
                          label="Allow repeat discounts after expiry"
                          checked={draft.allowRepeatDiscount}
                          onChange={(v) =>
                            setDraft((d) => ({ ...d, allowRepeatDiscount: v }))
                          }
                        />
                        <RepeatToggle
                          id="allow-repeat-pause"
                          label="Allow repeat pauses"
                          checked={draft.allowRepeatPause}
                          onChange={(v) =>
                            setDraft((d) => ({ ...d, allowRepeatPause: v }))
                          }
                        />
                        <RepeatToggle
                          id="allow-repeat-downgrade"
                          label="Allow repeat downgrades"
                          checked={draft.allowRepeatDowngrade}
                          onChange={(v) =>
                            setDraft((d) => ({ ...d, allowRepeatDowngrade: v }))
                          }
                        />
                      </div>
                    </>
                  )}

                  {confirmPreview === 'saved' && (
                    <>
                      <Field label="Heading">
                        <Input
                          value={draft.savedHeading}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, savedHeading: e.target.value }))
                          }
                        />
                      </Field>
                      <Field label="Message">
                        <Textarea
                          rows={3}
                          className="resize-none"
                          value={draft.savedMessage}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, savedMessage: e.target.value }))
                          }
                        />
                      </Field>
                    </>
                  )}

                  {confirmPreview === 'cancelled' && (
                    <>
                      <Field label="Heading">
                        <Input
                          value={draft.cancelledHeading}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              cancelledHeading: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Message">
                        <Textarea
                          rows={3}
                          className="resize-none"
                          value={draft.cancelledMessage}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              cancelledMessage: e.target.value,
                            }))
                          }
                        />
                      </Field>
                    </>
                  )}
                </>
              )}
            </motion.div>
          </div>

          <div className="border-t border-border p-4">
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saving || isLoading}
            >
              {saving ? 'Saving…' : 'Save flow'}
            </Button>
          </div>
        </CardFlat>
      </div>
    </div>
  )
}

function Field({
  label,
  small,
  children,
}: {
  label: string
  small?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className={small ? 'text-xs' : 'text-sm'}>{label}</Label>
      {children}
    </div>
  )
}

function RepeatToggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
      </Label>
    </div>
  )
}
