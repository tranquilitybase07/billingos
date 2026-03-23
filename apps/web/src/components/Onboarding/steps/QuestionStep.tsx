'use client';

import { motion } from 'framer-motion';
import { OptionButton } from '../OptionButton';
import { ContinueButton } from '../ContinueButton';
import {
  optionContainerVariants,
  optionItemVariants,
  optionItemTransition,
  insightVariants,
} from '../motion';

export interface QuestionOption {
  value: string;
  label: string;
}

interface QuestionStepProps {
  icon: string;
  iconLabel: string;
  title: string;
  subtitle?: string;
  options: QuestionOption[];
  selected?: string;
  onSelect: (value: string) => void;
  insight?: string;
  onContinue?: () => void;
}

export function QuestionStep({
  icon,
  iconLabel,
  title,
  subtitle,
  options,
  selected,
  onSelect,
  insight,
  onContinue,
}: QuestionStepProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Icon */}
      <div className="mt-8 text-4xl select-none" role="img" aria-label={iconLabel}>
        {icon}
      </div>

      {/* Title + optional Subtitle */}
      <div className="flex flex-col items-center gap-1 -mt-2">
        <h1 className="text-xl font-bold text-foreground text-center">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground text-center">{subtitle}</p>
        )}
      </div>

      {/* Options */}
      <motion.div
        className="w-full flex flex-col gap-2"
        variants={optionContainerVariants}
        initial="initial"
        animate="animate"
      >
        {options.map((opt) => (
          <motion.div key={opt.value} variants={optionItemVariants} transition={optionItemTransition}>
            <OptionButton
              label={opt.label}
              selected={selected === opt.value}
              onClick={() => onSelect(opt.value)}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Insight callout shown after selection */}
      {insight && selected && (
        <motion.div
          className="w-full rounded-lg bg-muted border border-border p-4 text-sm text-muted-foreground leading-relaxed"
          variants={insightVariants}
          initial="initial"
          animate="animate"
        >
          {insight}
        </motion.div>
      )}

      {/* Continue button (manual advance mode) */}
      {onContinue && selected && (
        <motion.div
          className="w-full"
          variants={insightVariants}
          initial="initial"
          animate="animate"
        >
          <ContinueButton onClick={onContinue} />
        </motion.div>
      )}
    </div>
  );
}
