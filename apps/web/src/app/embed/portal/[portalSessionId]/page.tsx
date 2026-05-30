import { Suspense } from 'react'
import { PortalContent } from './components/PortalContent'
import { EmbedApiProvider } from '../../EmbedApiProvider'
import { getApiUrlForEnv, parseEnvironment } from '@/lib/config/environment'

const HEX_RE = /^[0-9a-fA-F]{3,8}$/
const LENGTH_RE = /^[\d.]+(px|rem|em)$/
const FONT_RE = /^[a-zA-Z0-9\s,\-'"]+$/

function safeHex(v?: string, fallback = '3b82f6'): string {
  return v && HEX_RE.test(v) ? v : fallback
}
function safeLength(v?: string): string | undefined {
  return v && LENGTH_RE.test(v) ? v : undefined
}
function safeFont(v?: string): string | undefined {
  return v && FONT_RE.test(v) ? v : undefined
}

export default async function PortalEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ portalSessionId: string }>
  searchParams: Promise<{
    env?: string
    tab?: string; theme?: string; accent?: string
    primary?: string; bg?: string; text?: string; radius?: string; font?: string
  }>
}) {
  const [{ portalSessionId }, sp] = await Promise.all([params, searchParams])
  const apiBaseUrl = getApiUrlForEnv(parseEnvironment(sp.env))
  const theme = (sp.theme === 'dark' || sp.theme === 'light' || sp.theme === 'auto') ? sp.theme : 'light'
  // Backward compat: accent param treated as alias for primary
  const primary = safeHex(sp.primary || sp.accent)
  const bg = sp.bg && HEX_RE.test(sp.bg) ? sp.bg : undefined
  const text = sp.text && HEX_RE.test(sp.text) ? sp.text : undefined
  const radius = safeLength(sp.radius)
  const font = safeFont(sp.font)

  // Build inline script to set CSS vars before hydration (prevents FOUC)
  const varsScript = [
    `var t='${theme}';`,
    `if(t==='auto')t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';`,
    `if(t==='dark')document.documentElement.classList.add('dark');`,
    `var s=document.documentElement.style;`,
    `s.setProperty('--portal-accent','#${primary}');`,
    `s.setProperty('--bos-primary','#${primary}');`,
    bg ? `s.setProperty('--bos-bg','#${bg}');` : '',
    text ? `s.setProperty('--bos-text','#${text}');` : '',
    radius ? `s.setProperty('--bos-radius','${radius}');` : '',
    font ? `s.setProperty('--bos-font','${font}');` : '',
  ].join('')

  return (
    <div className="min-h-screen bg-white dark:bg-[#141415]">
      <script dangerouslySetInnerHTML={{ __html: `(function(){${varsScript}})()` }} />
      <Suspense fallback={<PortalSkeleton dark={theme === 'dark'} />}>
        <EmbedApiProvider apiBaseUrl={apiBaseUrl}>
          <PortalContent sessionId={portalSessionId} defaultTab={sp.tab} theme={theme} accentColor={'#' + primary} />
        </EmbedApiProvider>
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
