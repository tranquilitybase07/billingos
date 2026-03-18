import { Suspense } from 'react'
import { PortalContent } from './components/PortalContent'

export default async function PortalEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ portalSessionId: string }>
  searchParams: Promise<{ tab?: string; theme?: string; accent?: string }>
}) {
  const [{ portalSessionId }, { tab, theme: rawTheme, accent: rawAccent }] = await Promise.all([params, searchParams])
  const theme = (rawTheme === 'dark' || rawTheme === 'light' || rawTheme === 'auto') ? rawTheme : 'light'
  const safeAccent = /^[0-9a-fA-F]{3,6}$/.test(rawAccent || '') ? rawAccent! : '3b82f6'

  return (
    <div className="min-h-screen bg-white dark:bg-[#141415]">
      <script dangerouslySetInnerHTML={{
        __html: `(function(){var t='${theme}';if(t==='auto')t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';if(t==='dark')document.documentElement.classList.add('dark');document.documentElement.style.setProperty('--portal-accent','#${safeAccent}');})()`
      }} />
      <Suspense fallback={<PortalSkeleton dark={theme === 'dark'} />}>
        <PortalContent sessionId={portalSessionId} defaultTab={tab} theme={theme} accentColor={'#' + safeAccent} />
      </Suspense>
    </div>
  )
}

function PortalSkeleton({ dark }: { dark?: boolean }) {
  return (
    <div className={`flex items-center justify-center min-h-screen ${dark ? 'bg-[#141415]' : 'bg-white'}`}>
      <div className={`w-7 h-7 rounded-full border-[3px] animate-spin ${dark ? 'border-neutral-700 border-t-neutral-300' : 'border-neutral-200 border-t-neutral-600'}`} />
    </div>
  )
}
