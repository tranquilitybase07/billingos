'use client';

import { useState } from 'react';
import GithubLoginButton from './GithubLoginButton';
import GoogleLoginButton from './GoogleLoginButton';
import AppleLoginButton from './AppleLoginButton';
import MagicLinkForm from './MagicLinkForm';
import { EmailPasswordForm } from './EmailPasswordForm';
import LabeledSeparator from '@/components/atoms/LabeledSeparator';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface LoginProps {
  returnTo?: string;
  isSignup?: boolean;
}

export default function Login({ returnTo, isSignup = false }: LoginProps) {
  const [showMagicLink, setShowMagicLink] = useState(false);

  return (
    <div className="flex flex-col gap-y-6">
      {/* PRIMARY: Email/Password Form */}
      <div className="flex w-full flex-col gap-y-4">
        <EmailPasswordForm isSignup={isSignup} returnTo={returnTo} />
      </div>

      {/* SECONDARY: Magic Link (Collapsible) */}
      <div className="flex w-full flex-col gap-y-3">
        <LabeledSeparator label="OR" />

        <button
          type="button"
          onClick={() => setShowMagicLink(!showMagicLink)}
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Use magic link instead</span>
          {showMagicLink ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showMagicLink && (
          <div className="animate-in fade-in-50 slide-in-from-top-2 duration-200">
            <MagicLinkForm returnTo={returnTo} variant="secondary" />
          </div>
        )}
      </div>

      {/* TERTIARY: OAuth Providers (Icon-only) */}
      <div className="flex w-full flex-col gap-y-3">
        <LabeledSeparator label="OR" />

        <div className="flex items-center justify-center gap-3">
          <GoogleLoginButton returnTo={returnTo} variant="icon" />
          <GithubLoginButton returnTo={returnTo} variant="icon" />
          <AppleLoginButton returnTo={returnTo} variant="icon" />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Continue with social
        </p>
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
