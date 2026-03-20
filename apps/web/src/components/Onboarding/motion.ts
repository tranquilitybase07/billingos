import type { Variants, Transition } from 'framer-motion';

// Step transitions (AnimatePresence in OnboardingFlow)
export const stepVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, y: 20, transition: { duration: 0.2 } },
};

// Staggered option list (inside each step)
export const optionContainerVariants: Variants = {
  animate: { transition: { staggerChildren: 0.05 } },
};

export const optionItemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

export const optionItemTransition: Transition = {
  duration: 0.25,
  ease: 'easeOut',
};

// Insight callout + continue button for Steps 4-5
export const insightVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
};

export const AUTO_ADVANCE_DELAY_MS = 400;
