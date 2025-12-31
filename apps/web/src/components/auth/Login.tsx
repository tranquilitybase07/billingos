'use client';

import GithubLoginButton from './GithubLoginButton';
import GoogleLoginButton from './GoogleLoginButton';
import AppleLoginButton from './AppleLoginButton';
import MagicLinkForm from './MagicLinkForm';
import LabeledSeparator from '@/components/atoms/LabeledSeparator';
import Link from 'next/link';

interface LoginProps {
  returnTo?: string;
  isSignup?: boolean;
}

export default function Login({ returnTo, isSignup = false }: LoginProps) {
  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex w-full flex-col gap-y-4">
        <GithubLoginButton returnTo={returnTo} />
        <GoogleLoginButton returnTo={returnTo} />
        <AppleLoginButton returnTo={returnTo} />
        <LabeledSeparator label="Or" />
        <MagicLinkForm returnTo={returnTo} />
      </div>
      <div className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
        By using BillingOS you agree to our{' '}
        <Link
          href="/legal/terms"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link
          href="/legal/privacy"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Privacy Policy
        </Link>
      </div>
    </div>
  );
}
