'use client';

import { OptionButton } from '../OptionButton';

interface StepHearAboutUsProps {
  selected?: string;
  onSelect: (value: string) => void;
}

const SOCIAL_MEDIA = [
  { value: 'twitter', label: 'Twitter / X' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'youtube', label: 'YouTube' },
];

const AI_TOOLS = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'claude', label: 'Claude' },
  { value: 'perplexity', label: 'Perplexity' },
];

const OTHER = [
  { value: 'google', label: 'Google search' },
  { value: 'friend', label: 'A friend told me' },
  { value: 'other', label: 'Other' },
];

export function StepHearAboutUs({ selected, onSelect }: StepHearAboutUsProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Icon */}
      <div className="mt-2 text-4xl select-none" role="img" aria-label="Search">
        🔍
      </div>

      {/* Title */}
      <h1 className="text-xl font-bold text-foreground text-center -mt-2">
        How did you hear about us?
      </h1>

      {/* Options */}
      <div className="w-full flex flex-col gap-6">
        {/* Social Media */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Social Media
          </p>
          <div className="flex flex-col gap-2">
            {SOCIAL_MEDIA.map((opt) => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                selected={selected === opt.value}
                onClick={() => onSelect(opt.value)}
              />
            ))}
          </div>
        </div>

        {/* AI */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            AI
          </p>
          <div className="flex flex-col gap-2">
            {AI_TOOLS.map((opt) => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                selected={selected === opt.value}
                onClick={() => onSelect(opt.value)}
              />
            ))}
          </div>
        </div>

        {/* Other */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Other
          </p>
          <div className="flex flex-col gap-2">
            {OTHER.map((opt) => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                selected={selected === opt.value}
                onClick={() => onSelect(opt.value)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
