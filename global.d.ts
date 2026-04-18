// Allow importing global CSS and common static asset types in TypeScript
declare module '*.css'
declare module '*.scss'
declare module '*.svg'
declare module '*.png'
declare module '*.jpg'
declare module '*.jpeg'
declare module '*.gif'

declare global {
  interface Window {
    Kakao?: {
      init: (appKey: string) => void
      isInitialized: () => boolean
      Share: {
        sendDefault: (payload: any) => void
      }
    }
  }
}

export {}
