'use client';

import { createClient } from '@/lib/supabase/client';
import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface MagicLinkFormProps {
  returnTo?: string;
  variant?: 'default' | 'secondary';
}

export default function MagicLinkForm({
  returnTo = '/dashboard',
  variant = 'default'
}: MagicLinkFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    console.log('Sending magic link to:', email, `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`,
        },
      });

      if (error) {
        console.error('Error sending magic link:', error);
        alert(`Failed to send magic link: ${error.message}`);
      } else {
        setSent(true);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-4 p-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">Check your email</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            We&apos;ve sent a magic link to <strong>{email}</strong>
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Click the link in the email to sign in.
          </p>
        </div>
        <Button
          onClick={() => setSent(false)}
          variant="secondary"
          fullWidth
        >
          Try another email
        </Button>
      </div>
    );
  }

  // Secondary variant - more subtle, collapsible
  if (variant === 'secondary') {
    return (
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        <div className="flex w-full flex-col gap-2">
          <Input
            type="email"
            required
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={loading}
            className="flex-1"
          />
          <Button
            type="submit"
            variant="ghost"
            disabled={loading}
            fullWidth
            className="text-sm"
          >
            {loading ? 'Sending magic link...' : 'Send magic link'}
          </Button>
        </div>
      </form>
    );
  }

  // Default variant - original style
  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2">
      <div className="flex w-full flex-row gap-2">
        <Input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={loading}
          className="flex-1"
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={loading}
        >
          {loading ? 'Sending...' : 'Login'}
        </Button>
      </div>
    </form>
  );
}
