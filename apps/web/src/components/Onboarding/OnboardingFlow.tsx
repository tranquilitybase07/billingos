'use client';

import { useState } from 'react';
import { Logo } from '@/components/branding/Logo';
import { StepHearAboutUs } from './steps/StepHearAboutUs';
import { StepTeamSize } from './steps/StepTeamSize';
import { StepFirstProduct } from './steps/StepFirstProduct';
import { StepStripeComplexity } from './steps/StepStripeComplexity';
import { StepGoals } from './steps/StepGoals';
import { StepComplete } from './steps/StepComplete';

export type OnboardingAnswers = {
  hearAboutUs?: string;
  teamSize?: string;
  firstProduct?: string;
  stripeComplexity?: string;
  goals?: string;
};

const TOTAL_STEPS = 6;

export function OnboardingFlow() {
  const [currentStep, setCurrentStep] = useState(1);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});

  const progressPercent = (currentStep / TOTAL_STEPS) * 100;

  const handleNext = (key: keyof OnboardingAnswers, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  };

  const handleStepNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <span className="text-sm font-semibold text-foreground">BillingOS</span>
        </div>
        <span className="text-sm text-muted-foreground">Setting up your workspace</span>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col pt-[73px]">
        {/* Progress Bar */}
        <div className="px-6 pt-6 pb-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Step {currentStep} of {TOTAL_STEPS}
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

        {/* Step Content */}
        <div className="flex-1 flex flex-col items-center px-4 py-8">
          <div className="w-full max-w-[520px]">
            {currentStep === 1 && (
              <StepHearAboutUs
                selected={answers.hearAboutUs}
                onSelect={(v: string) => handleNext('hearAboutUs', v)}
              />
            )}
            {currentStep === 2 && (
              <StepTeamSize
                selected={answers.teamSize}
                onSelect={(v: string) => handleNext('teamSize', v)}
              />
            )}
            {currentStep === 3 && (
              <StepFirstProduct
                selected={answers.firstProduct}
                onSelect={(v: string) => handleNext('firstProduct', v)}
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
                onContinue={handleStepNext}
              />
            )}
            {currentStep === 6 && (
              <StepComplete />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
