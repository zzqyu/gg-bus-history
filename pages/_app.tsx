import type { AppProps } from 'next/app'
import Head from 'next/head'
import '../styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
        <meta name="google-site-verification" content="krc5Ql6xLRJcuO1H4KETKxtG1cozEJ6-oE6U9IROdxA" />
        <meta name="naver-site-verification" content="2e79c240266f4cf80f0120f65f75190c6a45781d" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#1E3A8A" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
