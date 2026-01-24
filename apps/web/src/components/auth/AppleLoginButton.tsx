'use client';

import { createClient } from '@/lib/supabase/client';
import Button from '@/components/atoms/Button';
import { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AppleLoginButtonProps {
  returnTo?: string;
  text?: string;
  size?: 'large' | 'small';
  fullWidth?: boolean;
  variant?: 'default' | 'icon';
}

export default function AppleLoginButton({
  returnTo = '/dashboard',
  text = 'Continue with Apple',
  size = 'large',
  fullWidth = true,
  variant = 'default',
}: AppleLoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleAppleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`,
        },
      });

      if (error) {
        console.error('Error signing in with Apple:', error);
        alert('Failed to sign in with Apple. Please try again.');
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const AppleIcon = () => (
    <svg
      className={variant === 'icon' ? 'h-5 w-5' : size === 'large' ? 'h-5 w-5' : 'h-4 w-4'}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );

  // Icon-only variant
  if (variant === 'icon') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleAppleLogin}
              disabled={loading}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Continue with Apple"
            >
              <AppleIcon />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Continue with Apple</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Default variant with text
  const largeStyle = 'p-2.5 px-5 text-md space-x-3';
  const smallStyle = 'p-2 px-4 text-sm space-x-2';

  return (
    <Button
      onClick={handleAppleLogin}
      disabled={loading}
      variant="secondary"
      wrapperClassNames={size === 'large' ? largeStyle : smallStyle}
      className={size === 'large' ? 'text-md p-5' : ''}
      fullWidth={fullWidth}
    >
      <AppleIcon />
      <span className="whitespace-nowrap">{loading ? 'Signing in...' : text}</span>
    </Button>
  );
}
