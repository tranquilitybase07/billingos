import Login from '@/components/auth/Login';
import Logo from '@/components/branding/Logo';
import Link from 'next/link';

export const metadata = {
  title: 'Sign Up | BillingOS',
  description: 'Create your BillingOS account',
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; email?: string }>;
}) {
  const { returnTo, email } = await searchParams;
  const loginHref = returnTo
    ? `/login?returnTo=${encodeURIComponent(returnTo)}${email ? `&email=${encodeURIComponent(email)}` : ''}`
    : '/login';
  const isInvite = !!returnTo && returnTo.startsWith('/invite/');

  return (
    <div className="flex h-screen w-full grow items-center justify-center">
      <div className="flex w-full max-w-md flex-col justify-between gap-16 rounded-4xl p-12">
        <div className="flex flex-col items-center">
          <Logo size={60} />
          <h1 className="mt-6 text-2xl font-semibold text-gray-900 dark:text-white">
            {isInvite ? 'Join your team on BillingOS' : 'Get started with BillingOS'}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {isInvite
              ? 'Create your account to accept the invitation'
              : 'Create your account and start billing in minutes'}
          </p>
        </div>
        <Login
          isSignup
          returnTo={returnTo}
          initialEmail={email}
          emailLocked={isInvite}
        />
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account?{' '}
          <Link
            href={loginHref}
            className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
