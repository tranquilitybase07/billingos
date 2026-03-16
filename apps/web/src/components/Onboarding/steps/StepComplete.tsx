'use client';

import { useRouter } from 'next/navigation';
import { ContinueButton } from '../ContinueButton';

export function StepComplete() {
  const router = useRouter();

  const handleGoToDashboard = () => {
    // Mark onboarding as complete so middleware skips it for this user
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `billingos_onboarded=true; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
    router.push('/dashboard');
  };

  return (
    <div className="flex flex-col items-center gap-8 py-12 text-center">
      {/* Success icon */}
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-950/50">
        <span className="text-4xl select-none" role="img" aria-label="Rocket">
          🚀
        </span>
      </div>

      {/* Title + Subtitle */}
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-foreground">
          You&apos;re all set!
        </h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
          Your workspace is ready. Let&apos;s get your billing up and running in minutes — not weeks.
        </p>
      </div>

      {/* Features list */}
      <div className="w-full flex flex-col gap-3">
        {[
          { icon: '⚡', title: 'Stripe in minutes', desc: 'Connect and go live today' },
          { icon: '🔄', title: 'Subscriptions handled', desc: 'Upgrades, downgrades, cancels — automated' },
          { icon: '📊', title: 'Revenue insights', desc: 'Charts, metrics, and cohort analysis built in' },
        ].map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left"
          >
            <span className="text-xl select-none mt-0.5">{item.icon}</span>
            <div>
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <ContinueButton
        label="Go to Dashboard →"
        onClick={handleGoToDashboard}
      />
    </div>
  );
}
