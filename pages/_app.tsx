import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useEffect } from 'react'
import { Noto_Sans_KR } from 'next/font/google'
import '../styles/globals.css'
import ErrorBoundary from '../components/ErrorBoundary'
import { Toaster } from '../components/ui/sonner'
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '../utils/site'
import { useRouter } from 'next/router'

// 시스템 폰트에 기대면 한글 글리프가 기기·브라우저마다(맥 Chrome vs iOS Safari 등) 다른
// 폰트로 대체되는 문제가 있었다. Noto Sans KR을 next/font로 빌드 시점에 자체 호스팅해
// --font-sans 값을 고정하면, 이 값을 쓰는 Tailwind font-sans 유틸이 모든 기기에서
// 항상 같은 폰트를 가리키게 된다.
const notoSansKR = Noto_Sans_KR({
  weight: ['400', '500', '700', '900'],
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  // Search parameters describe a search state, not a separate crawlable page.
  // Exclude them so every page has one stable canonical URL.
  const canonicalPath = (router.asPath.split(/[?#]/)[0] || '/').replace(/\/$/, '') || '/'
  const canonicalUrl = `${SITE_URL}${canonicalPath === '/' ? '/' : canonicalPath}`

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  return (
    <>
      <Head>
        <title>{SITE_TITLE}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="버스탈시간" />
        <meta property="og:title" content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <meta name="google-site-verification" content="krc5Ql6xLRJcuO1H4KETKxtG1cozEJ6-oE6U9IROdxA" />
        <meta name="naver-site-verification" content="2ea8a5758222284a6bd9f3cef14aada995a63087" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1E3A8A" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="버스탈시간" />
      </Head>
      <div className={notoSansKR.variable}>
        <ErrorBoundary>
          <Component {...pageProps} />
        </ErrorBoundary>
        <Toaster position="top-center" />
      </div>
    </>
  )
}
