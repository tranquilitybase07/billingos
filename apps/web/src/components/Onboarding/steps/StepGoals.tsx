'use client';

import { OptionButton } from '../OptionButton';
import { ContinueButton } from '../ContinueButton';

interface StepGoalsProps {
  selected?: string;
  onSelect: (value: string) => void;
  onContinue: () => void;
}

const OPTIONS = [
  { value: 'first-customer', label: 'Get my first paying customer ASAP' },
  { value: 'upgrade-flows', label: 'Set up upgrades, downgrades & cancel flows' },
  { value: 'taxes', label: 'Handle taxes without losing my mind' },
  { value: 'all', label: 'All of the above, honestly' },
];

export function StepGoals({ selected, onSelect, onContinue }: StepGoalsProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Icon */}
      <div className="mt-8 text-4xl select-none" role="img" aria-label="Money">
        💸
      </div>

      {/* Title */}
      <h1 className="text-xl font-bold text-foreground text-center -mt-2">
        What matters most to you right now?
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
          Perfect. That&apos;s exactly what BillingOS is built for. Let&apos;s get your billing live
          today. 👇
        </div>
      )}

      {/* Continue Button */}
      {selected && (
        <ContinueButton
          onClick={onContinue}
          className="animate-in fade-in slide-in-from-bottom-2 duration-300"
        />
      )}
    </div>
  );
}
