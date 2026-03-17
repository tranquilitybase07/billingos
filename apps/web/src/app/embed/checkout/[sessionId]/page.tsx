import { Suspense } from 'react'
import { CheckoutContent } from './components/CheckoutContent'

export default async function CheckoutEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ theme?: string; accent?: string }>
}) {
  const [{ sessionId }, { theme: rawTheme, accent }] = await Promise.all([params, searchParams])
  const theme = (rawTheme === 'dark' || rawTheme === 'light' || rawTheme === 'auto') ? rawTheme : 'light'

  return (
    <div className="min-h-screen bg-white dark:bg-[#141415]">
      <script dangerouslySetInnerHTML={{
        __html: `
        (function(){
          var t='${theme}';
          if(t==='auto') t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
          if(t==='dark') document.documentElement.classList.add('dark');
          var a='${accent || '3b82f6'}';
          document.documentElement.style.setProperty('--checkout-accent','#'+a);
        })()
      `}} />
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutContent sessionId={sessionId} theme={theme} accentColor={'#' + (accent || '3b82f6')} />
      </Suspense>
    </div>
  )
}

function CheckoutSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-6"></div>
        <div className="space-y-3">
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
        </div>
        <div className="mt-6">
          <div className="h-12 bg-gray-300 rounded"></div>
        </div>
      </div>
    </div>
  )
}