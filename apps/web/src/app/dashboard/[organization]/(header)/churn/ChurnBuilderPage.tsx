'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { ChurnFlowBody } from '@/components/churn/ChurnFlow'
import type {
  ChurnFlowConfig,
  ChurnStep,
  ConfirmStep,
  SurveyStep,
} from '@/components/churn/types'
import {
  useChurnFlows,
  useCreateChurnFlow,
  useUpdateChurnFlow,
  type ChurnFlow,
} from '@/hooks/queries/churn-flows'

interface OfferDraft {
  enabled: boolean
  kind: 'discount' | 'pause'
  percentOff: number
  durationInMonths: number
  pauseMonths: number
}

interface ReasonDraft {
  key: string
  label: string
  offer: OfferDraft
}

interface FlowDraft {
  id?: string
  name: string
  enabled: boolean
  surveyTitle: string
  reasons: ReasonDraft[]
  confirmTitle: string
  allowImmediate: boolean
  losses: string
  allowRepeatDiscount: boolean
  allowRepeatPause: boolean
}

const DEFAULT_OFFER: OfferDraft = {
  enabled: false,
  kind: 'discount',
  percentOff: 20,
  durationInMonths: 3,
  pauseMonths: 0,
}

const DEFAULT_DRAFT: FlowDraft = {
  name: 'Default cancel flow',
  enabled: false,
  surveyTitle: 'Before you go…',
  reasons: [
    { key: 'too_expensive', label: 'Too expensive', offer: { ...DEFAULT_OFFER, enabled: true } },
    { key: 'not_using', label: 'Not using it enough', offer: { ...DEFAULT_OFFER, kind: 'pause' } },
    { key: 'missing_features', label: 'Missing features', offer: { ...DEFAULT_OFFER } },
    { key: 'found_alternative', label: 'Found an alternative', offer: { ...DEFAULT_OFFER } },
    { key: 'other', label: 'Other', offer: { ...DEFAULT_OFFER } },
  ],
  confirmTitle: 'Cancel subscription?',
  allowImmediate: true,
  losses: 'Your saved data\nPremium features\nPriority support',
  allowRepeatDiscount: false,
  allowRepeatPause: false,
}

function draftFromFlow(flow: ChurnFlow): FlowDraft {
  const steps = (flow.steps ?? []) as ChurnStep[]
  const survey = steps.find((s): s is SurveyStep => s.type === 'survey')
  const confirm = steps.find((s): s is ConfirmStep => s.type === 'confirm')
  return {
    id: flow.id,
    name: flow.name,
    enabled: flow.enabled,
    surveyTitle: survey?.title ?? 'Before you go…',
    reasons:
      survey?.reasons.map((r) => ({
        key: r.key,
        label: r.label,
        offer: {
          enabled: r.offer?.type === 'discount' || r.offer?.type === 'pause',
          kind: r.offer?.type === 'pause' ? 'pause' : 'discount',
          percentOff:
            r.offer?.type === 'discount' ? (r.offer.percentOff ?? 20) : 20,
          durationInMonths:
            r.offer?.type === 'discount' ? (r.offer.durationInMonths ?? 0) : 3,
          pauseMonths:
            r.offer?.type === 'pause' ? (r.offer.durationInMonths ?? 0) : 0,
        } satisfies OfferDraft,
      })) ?? DEFAULT_DRAFT.reasons,
    confirmTitle: confirm?.title ?? 'Cancel subscription?',
    allowImmediate: confirm?.allowImmediate ?? true,
    losses: (confirm?.losses ?? []).join('\n'),
    allowRepeatDiscount: flow.settings?.allowRepeatDiscount ?? false,
    allowRepeatPause: flow.settings?.allowRepeatPause ?? false,
  }
}

// TODO: the builder emits `percentOff` discount and `pause` offers in v1. The
// backend/config model also supports `amountOff` and `contact`/`redirect` offers
// — extend this editor when those are exposed to merchants.
function buildSteps(draft: FlowDraft): ChurnStep[] {
  const survey: SurveyStep = {
    id: 'survey',
    type: 'survey',
    title: draft.surveyTitle,
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
                : {
                  type: 'discount' as const,
                  percentOff: r.offer.percentOff,
                  ...(r.offer.durationInMonths > 0
                    ? { durationInMonths: r.offer.durationInMonths }
                    : {}),
                },
          }
          : {}),
      })),
  }
  const confirm: ConfirmStep = {
    id: 'confirm',
    type: 'confirm',
    title: draft.confirmTitle,
    allowImmediate: draft.allowImmediate,
    losses: draft.losses
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  }
  return [survey, confirm]
}

const PREVIEW_SUBSCRIPTION = {
  planName: 'Pro',
  amount: 2900,
  currency: 'usd',
  interval: 'month',
  renewalDate: new Date().toISOString(),
}

export default function ChurnBuilderPage({
  organizationId,
}: {
  organizationId: string
}) {
  const { toast } = useToast()
  const { data: flows, isLoading } = useChurnFlows(organizationId)
  const createFlow = useCreateChurnFlow(organizationId)
  const updateFlow = useUpdateChurnFlow(organizationId)

  const [draft, setDraft] = useState<FlowDraft>(DEFAULT_DRAFT)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!hydrated && flows) {
      if (flows.length > 0) setDraft(draftFromFlow(flows[0]))
      setHydrated(true)
    }
  }, [flows, hydrated])

  const previewSteps = useMemo(() => buildSteps(draft), [draft])
  const previewKey = useMemo(() => JSON.stringify(previewSteps), [previewSteps])
  const previewConfig: ChurnFlowConfig = useMemo(
    () => ({ id: 'preview', name: draft.name, enabled: true, steps: previewSteps }),
    [draft.name, previewSteps],
  )

  const saving = createFlow.isPending || updateFlow.isPending

  const handleSave = async () => {
    const input = {
      name: draft.name.trim() || 'Cancel flow',
      enabled: draft.enabled,
      steps: buildSteps(draft),
      settings: {
        allowRepeatDiscount: draft.allowRepeatDiscount,
        allowRepeatPause: draft.allowRepeatPause,
      },
    }
    try {
      if (draft.id) {
        await updateFlow.mutateAsync({ id: draft.id, input })
      } else {
        const created = await createFlow.mutateAsync(input)
        setDraft((d) => ({ ...d, id: created.id }))
      }
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
      if (draft.id) {
        await updateFlow.mutateAsync({ id: draft.id, input: { enabled: v } })
      } else {
        const created = await createFlow.mutateAsync({
          name: draft.name.trim() || 'Cancel flow',
          enabled: v,
          steps: buildSteps(draft),
          settings: {
            allowRepeatDiscount: draft.allowRepeatDiscount,
            allowRepeatPause: draft.allowRepeatPause,
          },
        })
        setDraft((d) => ({ ...d, id: created.id }))
      }
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

  const addReason = () =>
    setDraft((d) => ({
      ...d,
      reasons: [
        ...d.reasons,
        {
          key: `reason_${d.reasons.length + 1}_${Date.now().toString(36)}`,
          label: '',
          offer: { ...DEFAULT_OFFER },
        },
      ],
    }))

  const removeReason = (i: number) =>
    setDraft((d) => ({ ...d, reasons: d.reasons.filter((_, idx) => idx !== i) }))

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Churn flow</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build the cancellation save flow your customers see in the portal. Survey →
            targeted save offer → cancel.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="flow-enabled"
              checked={draft.enabled}
              disabled={saving}
              onCheckedChange={handleToggleEnabled}
            />
            <Label htmlFor="flow-enabled" className="cursor-pointer">
              {draft.enabled ? 'Live' : 'Off'}
            </Label>
          </div>
          <Button onClick={handleSave} disabled={saving || isLoading}>
            {saving ? 'Saving…' : 'Save flow'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Flow settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Flow name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Survey heading</Label>
                <Input
                  value={draft.surveyTitle}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, surveyTitle: e.target.value }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cancellation reasons & offers</CardTitle>
              <CardDescription>
                Attach a discount to any reason. Choosing that reason surfaces the offer
                before cancelling.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {draft.reasons.map((reason, i) => (
                <div
                  key={reason.key}
                  className="rounded-lg border p-3 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={reason.label}
                      placeholder="Reason label"
                      onChange={(e) => updateReason(i, { label: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeReason(i)}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`offer-${reason.key}`}
                      checked={reason.offer.enabled}
                      onCheckedChange={(v) => updateOffer(i, { enabled: v })}
                    />
                    <Label htmlFor={`offer-${reason.key}`} className="cursor-pointer">
                      Save offer
                    </Label>
                  </div>
                  {reason.offer.enabled && (
                    <div className="space-y-3 pl-1">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            reason.offer.kind === 'discount' ? 'default' : 'outline'
                          }
                          onClick={() => updateOffer(i, { kind: 'discount' })}
                        >
                          Discount
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            reason.offer.kind === 'pause' ? 'default' : 'outline'
                          }
                          onClick={() => updateOffer(i, { kind: 'pause' })}
                        >
                          Pause
                        </Button>
                      </div>
                      {reason.offer.kind === 'discount' ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Percent off</Label>
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
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Months (0 = once)</Label>
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
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="space-y-1.5 max-w-[50%]">
                            <Label className="text-xs">
                              Resume after months (0 = indefinite)
                            </Label>
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
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Billing pauses; the customer keeps access until the end of
                            their current period.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addReason}>
                Add reason
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Confirm step</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Heading</Label>
                <Input
                  value={draft.confirmTitle}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, confirmTitle: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>What they&apos;ll lose (one per line)</Label>
                <Textarea
                  rows={4}
                  value={draft.losses}
                  onChange={(e) => setDraft((d) => ({ ...d, losses: e.target.value }))}
                  className="resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="allow-immediate"
                  checked={draft.allowImmediate}
                  onCheckedChange={(v) =>
                    setDraft((d) => ({ ...d, allowImmediate: v }))
                  }
                />
                <Label htmlFor="allow-immediate" className="cursor-pointer">
                  Allow immediate cancellation
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Save offer policy</CardTitle>
              <CardDescription>
                Controls whether a customer can claim a save offer more than once.
                A customer already in the offer&apos;s end-state (discounted or
                paused) is never re-granted it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Switch
                  id="allow-repeat-discount"
                  checked={draft.allowRepeatDiscount}
                  onCheckedChange={(v) =>
                    setDraft((d) => ({ ...d, allowRepeatDiscount: v }))
                  }
                />
                <div>
                  <Label
                    htmlFor="allow-repeat-discount"
                    className="cursor-pointer"
                  >
                    Allow repeat discounts after expiry
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Off (recommended): the save discount is one-time per customer.
                    On: once their discount ends they can claim it again on a future
                    cancel attempt.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Switch
                  id="allow-repeat-pause"
                  checked={draft.allowRepeatPause}
                  onCheckedChange={(v) =>
                    setDraft((d) => ({ ...d, allowRepeatPause: v }))
                  }
                />
                <div>
                  <Label htmlFor="allow-repeat-pause" className="cursor-pointer">
                    Allow repeat pauses
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Off (recommended): the pause offer is one-time per customer.
                    On: after resuming they can pause again on a future cancel
                    attempt.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-6 h-fit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live preview</CardTitle>
              <CardDescription>
                Exactly what your customer sees. Actions here are simulated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border bg-background p-6">
                <ChurnFlowBody
                  key={previewKey}
                  config={previewConfig}
                  subscription={PREVIEW_SUBSCRIPTION}
                  onApplyOffer={async () => 'saved' as const}
                  onCancel={async () => { }}
                  onClose={() => { }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
