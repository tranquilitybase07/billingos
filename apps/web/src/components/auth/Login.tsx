'use client';

// import { useState } from 'react';
// import GithubLoginButton from './GithubLoginButton';
import GoogleLoginButton from './GoogleLoginButton';
// import AppleLoginButton from './AppleLoginButton';
// import MagicLinkForm from './MagicLinkForm';
import { EmailPasswordForm } from './EmailPasswordForm';
import LabeledSeparator from '@/components/atoms/LabeledSeparator';
import Link from 'next/link';
// import { ArrowDown01Icon, ArrowUp01Icon } from 'hugeicons-react';

interface LoginProps {
  returnTo?: string;
  isSignup?: boolean;
}

export default function Login({ returnTo, isSignup = false }: LoginProps) {
  // const [showMagicLink, setShowMagicLink] = useState(false);

  return (
    <div className="flex flex-col gap-y-6">
      {/* PRIMARY: Email/Password Form */}
      <div className="flex w-full flex-col gap-y-4">
        <EmailPasswordForm isSignup={isSignup} returnTo={returnTo} />
      </div>

      {/* SECONDARY: Magic Link (Collapsible) */}
      {/*
      <div className="flex w-full flex-col gap-y-3">
        <LabeledSeparator label="OR" />

        <button
          type="button"
          onClick={() => setShowMagicLink(!showMagicLink)}
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Use magic link instead</span>
          {showMagicLink ? (
            <ArrowUp01Icon size={16} />
          ) : (
            <ArrowDown01Icon size={16} />
          )}
        </button>

        {showMagicLink && (
          <div className="animate-in fade-in-50 slide-in-from-top-2 duration-200">
            <MagicLinkForm returnTo={returnTo} variant="secondary" />
          </div>
        )}
      </div>
      */}

      {/* TERTIARY: OAuth Providers */}
      <div className="flex w-full flex-col gap-y-3">
        <LabeledSeparator label="OR" />

        <GoogleLoginButton returnTo={returnTo} fullWidth />
        {/* <GithubLoginButton returnTo={returnTo} variant="icon" /> */}
        {/* <AppleLoginButton returnTo={returnTo} variant="icon" /> */}
      </div>

      {/* Terms of Service */}
      <div className="mt-2 text-center text-xs text-muted-foreground">
        By using BillingOS you agree to our{' '}
        <Link
          href="/legal/terms"
          className="text-primary hover:underline"
        >
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link
          href="/legal/privacy"
          className="text-primary hover:underline"
        >
          Privacy Policy
        </Link>
      </div>
    </div>
  );
}
