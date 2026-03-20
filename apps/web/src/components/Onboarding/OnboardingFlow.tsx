'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { StepHearAboutUs } from './steps/StepHearAboutUs';
import { StepTeamSize } from './steps/StepTeamSize';
import { StepFirstProduct } from './steps/StepFirstProduct';
import { StepStripeComplexity } from './steps/StepStripeComplexity';
import { StepGoals } from './steps/StepGoals';
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

const TOTAL_STEPS = 6;

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
                {currentStep === 1 && (
                  <StepHearAboutUs
                    selected={answers.hearAboutUs}
                    onSelect={(v: string) => handleAutoAdvanceSelect('hearAboutUs', v)}
                  />
                )}
                {currentStep === 2 && (
                  <StepTeamSize
                    selected={answers.teamSize}
                    onSelect={(v: string) => handleAutoAdvanceSelect('teamSize', v)}
                  />
                )}
                {currentStep === 3 && (
                  <StepFirstProduct
                    selected={answers.firstProduct}
                    onSelect={(v: string) => handleAutoAdvanceSelect('firstProduct', v)}
                  />
                )}
                {currentStep === 4 && (
                  <StepStripeComplexity
                    selected={answers.stripeComplexity}
                    onSelect={(v: string) => setAnswers((prev) => ({ ...prev, stripeComplexity: v }))}
                    onContinue={handleStepNext}
                  />
                )}
                {currentStep === 5 && (
                  <StepGoals
                    selected={answers.goals}
                    onSelect={(v: string) => setAnswers((prev) => ({ ...prev, goals: v }))}
                    onContinue={handleQuestionsComplete}
                  />
                )}
                {currentStep === 6 && (
                  <StepCreateOrg onOrgCreated={handleOrgCreated} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
