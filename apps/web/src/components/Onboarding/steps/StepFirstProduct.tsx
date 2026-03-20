'use client';

import { motion } from 'framer-motion';
import { OptionButton } from '../OptionButton';
import {
  optionContainerVariants,
  optionItemVariants,
  optionItemTransition,
} from '../motion';

interface StepFirstProductProps {
  selected?: string;
  onSelect: (value: string) => void;
}

const OPTIONS = [
  { value: 'first', label: 'Yep, first one! Super excited' },
  { value: 'built-before', label: "I've built one before" },
  { value: 'few-already', label: 'I have a few products already' },
];

export function StepFirstProduct({ selected, onSelect }: StepFirstProductProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Icon */}
      <div className="mt-8 text-4xl select-none" role="img" aria-label="Rocket">
        🚀
      </div>

      {/* Title + Subtitle */}
      <div className="flex flex-col items-center gap-1 -mt-2">
        <h1 className="text-xl font-bold text-foreground text-center">
          Is this your first SaaS product?
        </h1>
        <p className="text-sm text-muted-foreground text-center">
          No wrong answer — we&apos;ve got you either way.
        </p>
      </div>

      {/* Options */}
      <motion.div
        className="w-full flex flex-col gap-2"
        variants={optionContainerVariants}
        initial="initial"
        animate="animate"
      >
        {OPTIONS.map((opt) => (
          <motion.div key={opt.value} variants={optionItemVariants} transition={optionItemTransition}>
            <OptionButton
              label={opt.label}
              selected={selected === opt.value}
              onClick={() => onSelect(opt.value)}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
