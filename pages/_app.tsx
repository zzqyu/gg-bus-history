import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useEffect } from 'react'
import '../styles/globals.css'
import ErrorBoundary from '../components/ErrorBoundary'
import { Toaster } from '../components/ui/sonner'
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '../utils/site'
import { useRouter } from 'next/router'

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
        <meta name="naver-site-verification" content="2e79c240266f4cf80f0120f65f75190c6a45781d" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1E3A8A" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="버스탈시간" />
      </Head>
      <ErrorBoundary>
        <Component {...pageProps} />
      </ErrorBoundary>
      <Toaster position="top-center" />
    </>
  )
}
