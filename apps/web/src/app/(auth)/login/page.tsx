import Login from '@/components/auth/Login';
import Logo from '@/components/branding/Logo';
import Link from 'next/link';

export const metadata = {
  title: 'Login | BillingOS',
  description: 'Sign in to your BillingOS account',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams

  return (
    <div className="flex h-screen w-full grow items-center justify-center">
      <div className="flex w-full max-w-md flex-col justify-between gap-16 rounded-4xl p-12">
        <div className="flex flex-col items-center">
          <Logo size={40} />
          <h1 className="mt-6 text-2xl font-semibold text-gray-900 dark:text-white">
            Welcome back
          </h1>
        </div>

        {error === 'auth_failed' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Your reset link has expired or is invalid. Please request a new one.
          </div>
        )}

        <Login />
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
