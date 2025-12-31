'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextThemesProvider
      defaultTheme="dark"
      enableSystem={false}
      attribute="class"
    >
      {children}
    </NextThemesProvider>
  );
}
