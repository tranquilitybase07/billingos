'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { StepHearAboutUs } from './steps/StepHearAboutUs';
import { QuestionStep, type QuestionOption } from './steps/QuestionStep';
import { StepCreateOrg } from './steps/StepCreateOrg';
import { stepVariants, AUTO_ADVANCE_DELAY_MS } from './motion';
import { setOnboardingCookie } from './utils';
import { useOnboardingState, useUpdateOnboarding } from '@/hooks/queries/onboarding';

export type OnboardingAnswers = {
  hearAboutUs?: string;
  teamSize?: string;
  firstProduct?: string;
  stripeComplexity?: string;
  goals?: string;
};

type QuestionStepConfig = {
  type: 'question';
  answerKey: keyof OnboardingAnswers;
  icon: string;
  iconLabel: string;
  title: string;
  subtitle?: string;
  options: QuestionOption[];
  insight?: string;
  advanceMode: 'auto' | 'manual';
};

type CustomStepConfig = {
  type: 'custom';
};

type StepConfig = QuestionStepConfig | CustomStepConfig;

const STEP_CONFIGS: StepConfig[] = [
  // Step 1: How did you hear about us (grouped grid layout — custom component)
  { type: 'custom' },

  // Step 2: Team size
  {
    type: 'question',
    answerKey: 'teamSize',
    icon: '👥',
    iconLabel: 'Team',
    title: 'How big is your team right now?',
    subtitle: 'This helps us tailor your setup to match your pace.',
    options: [
      { value: 'solo', label: 'Just me, solo founder 🧍' },
      { value: '2-5', label: '2–5 people' },
      { value: '6-20', label: '6–20 people' },
      { value: '20+', label: '20+ people' },
    ],
    advanceMode: 'auto',
  },

  // Step 3: First SaaS product
  {
    type: 'question',
    answerKey: 'firstProduct',
    icon: '🚀',
    iconLabel: 'Rocket',
    title: 'Is this your first SaaS product?',
    subtitle: "No wrong answer — we've got you either way.",
    options: [
      { value: 'first', label: 'Yep, first one! Super excited' },
      { value: 'built-before', label: "I've built one before" },
      { value: 'few-already', label: 'I have a few products already' },
    ],
    advanceMode: 'auto',
  },

  // Step 4: Stripe complexity
  {
    type: 'question',
    answerKey: 'stripeComplexity',
    icon: '⏳',
    iconLabel: 'Hourglass',
    title: 'Real talk — how long do you think it takes to set up subscriptions, upgrades, downgrades, and cancel flows on Stripe from scratch?',
    options: [
      { value: 'few-hours', label: "A few hours, can't be that hard" },
      { value: 'couple-days', label: 'A couple of days maybe?' },
      { value: 'week-or-more', label: 'A week... or more 😅' },
      { value: 'nightmare', label: "I've done it before. It's a nightmare 💀" },
    ],
    insight:
      "Most founders spend 2–4 weeks wiring up Stripe, handling webhooks, edge cases, proration, and cancel flows. That's a month of not getting paid. BillingOS gets you live in under a day.",
    advanceMode: 'manual',
  },

  // Step 5: Goals
  {
    type: 'question',
    answerKey: 'goals',
    icon: '💸',
    iconLabel: 'Money',
    title: 'What matters most to you right now?',
    options: [
      { value: 'first-customer', label: 'Get my first paying customer ASAP' },
      { value: 'upgrade-flows', label: 'Set up upgrades, downgrades & cancel flows' },
      { value: 'taxes', label: 'Handle taxes without losing my mind' },
      { value: 'all', label: 'All of the above, honestly' },
    ],
    insight:
      "Perfect. That's exactly what BillingOS is built for. Let's get your billing live today. 👇",
    advanceMode: 'manual',
  },

  // Step 6: Create organization (form — custom component)
  { type: 'custom' },
];

const TOTAL_STEPS = STEP_CONFIGS.length;
const LAST_QUESTION_INDEX = 4; // Step 5 (goals) is the last question before org creation

export function OnboardingFlow() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: onboardingState, isLoading } = useOnboardingState();
  const updateOnboarding = useUpdateOnboarding();

  // Route to correct step based on DB state
  useEffect(() => {
    if (!onboardingState) return;

    const step = onboardingState.onboarding_step;

    if (step === 'complete') {
      setOnboardingCookie('complete');
      router.replace('/dashboard');
      return;
    }

    if (step === 'create_org') {
      setCurrentStep(6);
      setOnboardingCookie('create_org');
    } else {
      // 'questions' — start from Q1
      setCurrentStep(1);
    }

    // Restore answers from DB if any
    if (onboardingState.onboarding_answers && Object.keys(onboardingState.onboarding_answers).length > 0) {
      setAnswers(onboardingState.onboarding_answers as OnboardingAnswers);
    }
  }, [onboardingState, router]);

  const displayStep = currentStep ?? 0;
  const progressPercent = (displayStep / TOTAL_STEPS) * 100;

  // Cleanup auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Auto-advance: sets answer immediately, advances after delay
  const handleAutoAdvanceSelect = useCallback(
    (key: keyof OnboardingAnswers, value: string) => {
      setAnswers((prev) => ({ ...prev, [key]: value }));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCurrentStep((prev) => Math.min((prev ?? 1) + 1, TOTAL_STEPS));
      }, AUTO_ADVANCE_DELAY_MS);
    },
    [],
  );

  const handleStepNext = () => {
    setCurrentStep((prev) => Math.min((prev ?? 1) + 1, TOTAL_STEPS));
  };

  // After Q5 (Goals): save answers to DB and advance to org creation
  const handleQuestionsComplete = async () => {
    const allAnswers = { ...answers };
    try {
      await updateOnboarding.mutateAsync({
        onboarding_step: 'create_org',
        onboarding_answers: allAnswers,
      });
      setOnboardingCookie('create_org');
    } catch {
      // Best-effort — still advance locally
    }
    setCurrentStep(6);
  };

  // After org creation: mark complete and redirect
  const handleOrgCreated = async (slug: string) => {
    try {
      await updateOnboarding.mutateAsync({
        onboarding_step: 'complete',
      });
    } catch {
      // Best-effort
    }
    setOnboardingCookie('complete');
    router.push(`/dashboard/${slug}`);
  };

  // Loading state
  if (isLoading || currentStep === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  const stepIndex = currentStep - 1; // 0-based index into STEP_CONFIGS
  const config = STEP_CONFIGS[stepIndex];

  const renderStep = () => {
    if (config.type === 'question') {
      const isLastQuestion = stepIndex === LAST_QUESTION_INDEX;
      return (
        <QuestionStep
          icon={config.icon}
          iconLabel={config.iconLabel}
          title={config.title}
          subtitle={config.subtitle}
          options={config.options}
          selected={answers[config.answerKey]}
          onSelect={(v: string) => {
            if (config.advanceMode === 'auto') {
              handleAutoAdvanceSelect(config.answerKey, v);
            } else {
              setAnswers((prev) => ({ ...prev, [config.answerKey]: v }));
            }
          }}
          insight={config.insight}
          onContinue={
            config.advanceMode === 'manual'
              ? isLastQuestion
                ? handleQuestionsComplete
                : handleStepNext
              : undefined
          }
        />
      );
    }

    // Custom steps
    if (stepIndex === 0) {
      return (
        <StepHearAboutUs
          selected={answers.hearAboutUs}
          onSelect={(v: string) => handleAutoAdvanceSelect('hearAboutUs', v)}
        />
      );
    }

    return <StepCreateOrg onOrgCreated={handleOrgCreated} />;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 217 218" fill="none" className="w-full h-full">
              <path d="M41.5 193.5L22 174.5L73.5 121.5H0.5V94H75L21.5 42L41 22L93.5 74.5V0.5H122V74.5L174.5 22L194 42L142 94H216.5V122H126C123.381 123.252 122.422 124.382 122 127.5V217H93.5V142L41.5 193.5Z" fill="#DEACF5" stroke="#DEACF5" />
              <path d="M41.5 193.5L22 174.5L73.5 121.5H0.5V94H75L21.5 42L41 22L93.5 74.5V0.5H122V74.5L174.5 22L194 42L142 94H216.5V122H126C123.381 123.252 122.422 124.382 122 127.5V217H93.5V142L41.5 193.5Z" fill="#1570EF" stroke="#1570EF" />
              <rect x="159.016" y="139.862" width="54.2889" height="28.145" rx="14.0725" transform="rotate(44 159.016 139.862)" className="fill-black dark:fill-white" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground">BillingOS</span>
        </div>
        <span className="text-sm text-muted-foreground">Setting up your workspace</span>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col pt-[73px]">
        {/* Step Content */}
        <div className="flex-1 flex flex-col items-center px-4 py-8">
          <div className="w-full max-w-2xl">
            {/* Progress Bar — centered with content */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">
                  Step {displayStep} of {TOTAL_STEPS}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  {Math.round(progressPercent)}%
                </span>
              </div>
              <div className="h-1 w-full bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Animated step transitions */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
