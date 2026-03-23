ALTER TABLE public.users
  ADD COLUMN onboarding_step VARCHAR(50) NOT NULL DEFAULT 'questions',
  ADD COLUMN onboarding_answers JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX idx_users_onboarding_step ON public.users (onboarding_step)
  WHERE onboarding_step != 'complete';
