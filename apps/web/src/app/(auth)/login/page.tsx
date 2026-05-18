import Login from '@/components/auth/Login';
import Logo from '@/components/branding/Logo';
import Link from 'next/link';

export const metadata = {
  title: 'Login | BillingOS',
  description: 'Sign in to your BillingOS account',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; email?: string }>;
}) {
  const { returnTo, email } = await searchParams;
  const signupHref = returnTo
    ? `/signup?returnTo=${encodeURIComponent(returnTo)}${email ? `&email=${encodeURIComponent(email)}` : ''}`
    : '/signup';
  const emailLocked = !!returnTo && returnTo.startsWith('/invite/');

  return (
    <div className="flex h-screen w-full grow items-center justify-center">
      <div className="flex w-full max-w-md flex-col justify-between gap-16 rounded-4xl p-12">
        <div className="flex flex-col items-center">
          <Logo size={60} />
          <h1 className="mt-6 text-2xl font-semibold text-gray-900 dark:text-white">
            Welcome back
          </h1>
        </div>
        <Login
          returnTo={returnTo}
          initialEmail={email}
          emailLocked={emailLocked}
        />
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Don&apos;t have an account?{' '}
          <Link
            href={signupHref}
            className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
