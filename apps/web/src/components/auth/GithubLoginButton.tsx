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

interface GithubLoginButtonProps {
  returnTo?: string;
  text?: string;
  size?: 'large' | 'small';
  fullWidth?: boolean;
  variant?: 'default' | 'icon';
}

export default function GithubLoginButton({
  returnTo = '/dashboard',
  text = 'Continue with GitHub',
  size = 'large',
  fullWidth = true,
  variant = 'default',
}: GithubLoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleGithubLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`,
        },
      });

      if (error) {
        console.error('Error signing in with GitHub:', error);
        alert('Failed to sign in with GitHub. Please try again.');
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const GithubIcon = () => (
    <svg
      className={variant === 'icon' ? 'h-5 w-5' : size === 'large' ? 'h-5 w-5' : 'h-4 w-4'}
      aria-hidden="true"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
        clipRule="evenodd"
      />
    </svg>
  );

  // Icon-only variant
  if (variant === 'icon') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleGithubLogin}
              disabled={loading}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Continue with GitHub"
            >
              <GithubIcon />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Continue with GitHub</p>
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
      onClick={handleGithubLogin}
      disabled={loading}
      variant="secondary"
      wrapperClassNames={size === 'large' ? largeStyle : smallStyle}
      className={size === 'large' ? 'text-md p-5' : ''}
      fullWidth={fullWidth}
    >
      <GithubIcon />
      <span className="whitespace-nowrap">{loading ? 'Signing in...' : text}</span>
    </Button>
  );
}
