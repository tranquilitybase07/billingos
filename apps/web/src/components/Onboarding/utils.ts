export const ONBOARDING_STEP_COOKIE = 'billingos_onboarding_step';

export function setOnboardingCookie(step: string) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${ONBOARDING_STEP_COOKIE}=${step}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
}

export function clearOnboardingCookie() {
  document.cookie = `${ONBOARDING_STEP_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}
