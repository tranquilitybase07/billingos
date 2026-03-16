'use client';

import { useState } from 'react';
import { OptionButton } from '../OptionButton';
import { ContinueButton } from '../ContinueButton';

interface StepStripeComplexityProps {
  selected?: string;
  onSelect: (value: string) => void;
  onContinue: () => void;
}

const OPTIONS = [
  { value: 'few-hours', label: "A few hours, can't be that hard" },
  { value: 'couple-days', label: 'A couple of days maybe?' },
  { value: 'week-or-more', label: 'A week... or more 😅' },
  { value: 'nightmare', label: "I've done it before. It's a nightmare 💀" },
];

export function StepStripeComplexity({ selected, onSelect, onContinue }: StepStripeComplexityProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Icon */}
      <div className="mt-8 text-4xl select-none" role="img" aria-label="Hourglass">
        ⏳
      </div>

      {/* Title */}
      <h1 className="text-xl font-bold text-foreground text-center -mt-2">
        Real talk — how long do you think it takes to set up subscriptions, upgrades,
        downgrades, and cancel flows on Stripe from scratch?
      </h1>

      {/* Options */}
      <div className="w-full flex flex-col gap-2">
        {OPTIONS.map((opt) => (
          <OptionButton
            key={opt.value}
            label={opt.label}
            selected={selected === opt.value}
            onClick={() => onSelect(opt.value)}
          />
        ))}
      </div>

      {/* Insight callout shown after selection */}
      {selected && (
        <div className="w-full rounded-lg bg-muted border border-border p-4 text-sm text-muted-foreground leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-300">
          Most founders spend 2–4 weeks wiring up Stripe, handling webhooks, edge cases,
          proration, and cancel flows. That&apos;s a month of not getting paid. BillingOS gets you
          live in under a day.
        </div>
      )}

      {/* Continue Button */}
      {selected && (
        <ContinueButton onClick={onContinue} className="animate-in fade-in slide-in-from-bottom-2 duration-300" />
      )}
    </div>
  );
}
