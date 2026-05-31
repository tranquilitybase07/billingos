import { Suspense } from 'react'
import { CheckoutContent } from './components/CheckoutContent'
import { EmbedApiProvider } from '../../EmbedApiProvider'
import { getApiUrlForEnv, parseEnvironment } from '@/lib/config/environment'

const HEX_RE = /^[0-9a-fA-F]{3,8}$/
const LENGTH_RE = /^[\d.]+(px|rem|em)$/
const FONT_RE = /^[a-zA-Z0-9\s,\-'"]+$/

function safeHex(v?: string, fallback = '3b82f6'): string {
  return v && HEX_RE.test(v) ? v : fallback
}

export default async function CheckoutEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{
    env?: string
    theme?: string; accent?: string
    primary?: string; bg?: string; text?: string; radius?: string; font?: string
  }>
}) {
  const [{ sessionId }, sp] = await Promise.all([params, searchParams])
  const apiBaseUrl = getApiUrlForEnv(parseEnvironment(sp.env))
  const theme = (sp.theme === 'dark' || sp.theme === 'light' || sp.theme === 'auto') ? sp.theme : 'light'
  // Backward compat: accent treated as alias for primary
  const primary = safeHex(sp.primary || sp.accent)
  const bg = sp.bg && HEX_RE.test(sp.bg) ? sp.bg : undefined
  const text = sp.text && HEX_RE.test(sp.text) ? sp.text : undefined
  const radius = sp.radius && LENGTH_RE.test(sp.radius) ? sp.radius : undefined
  const font = sp.font && FONT_RE.test(sp.font) ? sp.font : undefined

  const varsScript = [
    `var t='${theme}';`,
    `if(t==='auto')t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';`,
    `if(t==='dark')document.documentElement.classList.add('dark');`,
    `var s=document.documentElement.style;`,
    `s.setProperty('--checkout-accent','#${primary}');`,
    `s.setProperty('--bos-primary','#${primary}');`,
    bg ? `s.setProperty('--bos-bg','#${bg}');` : '',
    text ? `s.setProperty('--bos-text','#${text}');` : '',
    radius ? `s.setProperty('--bos-radius','${radius}');` : '',
    font ? `s.setProperty('--bos-font','${font}');` : '',
  ].join('')

  return (
    <div className="min-h-screen bg-white dark:bg-[#141415]">
      {/* Warm DNS+TLS for Stripe so loadStripe() / CheckoutProvider don't
          pay that cost serially after the session resolves. */}
      <link rel="preconnect" href="https://js.stripe.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://api.stripe.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://r.stripe.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://m.stripe.network" />
      <script dangerouslySetInnerHTML={{ __html: `(function(){${varsScript}})()` }} />
      <Suspense fallback={<CheckoutSkeleton />}>
        <EmbedApiProvider apiBaseUrl={apiBaseUrl}>
          <CheckoutContent sessionId={sessionId} theme={theme} accentColor={'#' + primary} />
        </EmbedApiProvider>
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