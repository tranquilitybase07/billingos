'use client';

import { motion } from 'framer-motion';
import { OptionButton } from '../OptionButton';
import {
  optionContainerVariants,
  optionItemVariants,
  optionItemTransition,
} from '../motion';

interface StepTeamSizeProps {
  selected?: string;
  onSelect: (value: string) => void;
}

const OPTIONS = [
  { value: 'solo', label: 'Just me, solo founder 🧍' },
  { value: '2-5', label: '2–5 people' },
  { value: '6-20', label: '6–20 people' },
  { value: '20+', label: '20+ people' },
];

export function StepTeamSize({ selected, onSelect }: StepTeamSizeProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Icon */}
      <div className="mt-8 text-4xl select-none" role="img" aria-label="Team">
        👥
      </div>

      {/* Title + Subtitle */}
      <div className="flex flex-col items-center gap-1 -mt-2">
        <h1 className="text-xl font-bold text-foreground text-center">
          How big is your team right now?
        </h1>
        <p className="text-sm text-muted-foreground text-center">
          This helps us tailor your setup to match your pace.
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
