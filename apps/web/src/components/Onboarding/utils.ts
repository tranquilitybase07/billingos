export const ONBOARDING_STEP_COOKIE = 'billingos_onboarding_step';

export function setOnboardingCookie(step: string) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${ONBOARDING_STEP_COOKIE}=${step}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
}
