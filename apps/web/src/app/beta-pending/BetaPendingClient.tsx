'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Logo } from '@/components/branding/Logo';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type AccessStatus = 'pending' | 'approved' | 'denied';
type SubscriptionType =
  | 'saas'
  | 'usage_based'
  | 'seat_based'
  | 'hybrid'
  | 'not_sure';
type UserCount = '0' | '1-100' | '100-1k' | '1k-10k' | '10k+';

type BetaApplication = {
  building?: string;
  subscription_type?: SubscriptionType;
  user_count?: UserCount;
  website?: string;
  submitted_at?: string;
};

type UserProfile = {
  id: string;
  email: string;
  access_status: AccessStatus;
  beta_application: BetaApplication | null;
};

const SUBSCRIPTION_OPTIONS: { value: SubscriptionType; label: string }[] = [
  { value: 'saas', label: 'SaaS subscriptions' },
  { value: 'usage_based', label: 'Usage-based' },
  { value: 'seat_based', label: 'Seat-based' },
  { value: 'hybrid', label: 'Hybrid / Custom' },
  { value: 'not_sure', label: 'Not sure yet' },
];

const USER_COUNT_OPTIONS: { value: UserCount; label: string }[] = [
  { value: '0', label: '0' },
  { value: '1-100', label: '1-100' },
  { value: '100-1k', label: '100-1k' },
  { value: '1k-10k', label: '1k-10k' },
  { value: '10k+', label: '10k+' },
];

export function BetaPendingClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery<UserProfile>({
    queryKey: ['users', 'me'],
    queryFn: () => api.get<UserProfile>('/users/me'),
  });

  const [building, setBuilding] = useState('');
  const [subscriptionType, setSubscriptionType] =
    useState<SubscriptionType | null>(null);
  const [userCount, setUserCount] = useState<UserCount | null>(null);
  const [website, setWebsite] = useState('');

  useEffect(() => {
    if (!user?.beta_application) return;
    const app = user.beta_application;
    setBuilding(app.building ?? '');
    setSubscriptionType(app.subscription_type ?? null);
    setUserCount(app.user_count ?? null);
    setWebsite(app.website ?? '');
  }, [user]);

  const submitApplication = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      api.post<UserProfile>('/users/me/beta-application', payload),
    onSuccess: () => {
      toast({
        title: 'You’re on the waitlist',
        description: 'Thanks — we’ll get back to you shortly.',
      });
      void queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Submission failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!building.trim() || !subscriptionType || !userCount) return;
    submitApplication.mutate({
      building: building.trim(),
      subscription_type: subscriptionType,
      user_count: userCount,
      ...(website.trim() && { website: website.trim() }),
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const status = user?.access_status ?? 'pending';
  const hasApplied = !!user?.beta_application?.submitted_at;
  const canSubmit =
    !!building.trim() &&
    !!subscriptionType &&
    !!userCount &&
    !submitApplication.isPending;

  if (status === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="flex justify-center">
            <Logo size={56} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Your access request was declined
          </h1>
          <p className="text-sm text-muted-foreground">
            We’re not able to approve your account for the BillingOS private
            beta right now. If you think this is a mistake, reach out at{' '}
            <a className="underline" href="mailto:hello@billingos.dev">
              hello@billingos.dev
            </a>
            .
          </p>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (hasApplied) {
    return (
      <div className="min-h-screen flex flex-col px-6 py-14">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-full max-w-lg flex flex-col items-center text-center gap-5">
            <SuccessCheckIcon />
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                You’re on the list
              </h1>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Thanks — we’ll email you very soon. Keep an eye on your inbox.
              </p>
            </div>
          </div>
        </div>
        <div className="w-full max-w-xl mx-auto flex items-center justify-between pt-8 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={handleSignOut}
            className="hover:text-foreground transition-colors"
          >
            Sign out
          </button>
          <a
            href="https://docs.billingos.dev"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            docs.billingos.dev
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-14">
      <div className="w-full max-w-xl space-y-10">
        <div className="flex flex-col items-center gap-5">
          <Logo size={48} />
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
            Private Beta
          </span>
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">
              You’re almost in
            </h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              We’re onboarding users as fast as possible. Tell us about your
              product to move up the line.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-3">
            <label
              htmlFor="building"
              className="block text-base font-medium text-foreground"
            >
              What are you building?
            </label>
            <Textarea
              id="building"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder="Briefly describe your product or company..."
              required
              maxLength={2000}
              rows={5}
              className="resize-none"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-base font-medium text-foreground">
              What kind of subscriptions?
            </label>
            <div className="flex flex-wrap gap-2">
              {SUBSCRIPTION_OPTIONS.map((option) => (
                <PillButton
                  key={option.value}
                  selected={subscriptionType === option.value}
                  onClick={() => setSubscriptionType(option.value)}
                >
                  {option.label}
                </PillButton>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-base font-medium text-foreground">
              How many users do you already have?
            </label>
            <div className="flex flex-wrap gap-2">
              {USER_COUNT_OPTIONS.map((option) => (
                <PillButton
                  key={option.value}
                  selected={userCount === option.value}
                  onClick={() => setUserCount(option.value)}
                >
                  {option.label}
                </PillButton>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label
              htmlFor="website"
              className="block text-base font-medium text-foreground"
            >
              Website <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="yourcompany.com"
              maxLength={500}
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-base py-6 rounded-lg"
            disabled={!canSubmit}
          >
            {submitApplication.isPending ? 'Submitting…' : 'Join the waitlist'}
          </Button>
        </form>

        <div className="flex items-center justify-between pt-4 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={handleSignOut}
            className="hover:text-foreground transition-colors"
          >
            Sign out
          </button>
          <a
            href="https://docs.billingos.dev"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            docs.billingos.dev
          </a>
        </div>
      </div>
    </div>
  );
}

function PillButton({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-4 py-2 text-sm border transition-colors',
        'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
        selected &&
          'border-blue-500 bg-blue-500/15 text-foreground hover:bg-blue-500/20',
      )}
    >
      {children}
    </button>
  );
}

function SuccessCheckIcon() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-lg" />
      <svg
        width="56"
        height="56"
        viewBox="0 0 88 88"
        fill="none"
        className="relative"
      >
        <circle
          cx="44"
          cy="44"
          r="40"
          stroke="rgb(59 130 246)"
          strokeWidth="4"
        />
        <path
          d="M28 45.5L39.5 57L60 34"
          stroke="rgb(59 130 246)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
