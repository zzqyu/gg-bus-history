import React from 'react'

const DISMISSED_FLAG = 'bustal-onboarding-current-location-dismissed'

interface CurrentLocationBannerProps {
  /** 실제 앱에서는 getCurrentLocationAndSet('start')를 전달한다. */
  onUseCurrentLocation?: () => void | Promise<void>
}

type LocationStatus = 'idle' | 'loading' | 'success' | 'error'

/** 사용자가 버튼을 누른 뒤에만 위치 권한을 요청하는 출발지 제안 배너. */
export default function CurrentLocationBanner({ onUseCurrentLocation }: CurrentLocationBannerProps) {
  const [visible, setVisible] = React.useState(false)
  const [status, setStatus] = React.useState<LocationStatus>('idle')

  React.useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(DISMISSED_FLAG) !== '1')
    } catch {
      setVisible(true)
    }
  }, [])

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_FLAG, '1')
    } catch {
      // 저장할 수 없는 환경에서도 현재 화면에서는 닫는다.
    }
    setVisible(false)
  }

  async function handleUseCurrentLocation() {
    setStatus('loading')

    try {
      if (onUseCurrentLocation) {
        await onUseCurrentLocation()
      } else {
        if (!navigator.geolocation) {
          throw new Error('geolocation-unavailable')
        }

        // 실제 앱과 같은 흐름: 좌표를 먼저 반영하고, 주소 표시 갱신은 호출부에서 비동기로 처리한다.
        await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        })
      }
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  if (!visible) return null

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-lg text-primary-foreground">
          ⌖
        </span>
        <div>
          <h2 className="text-base font-bold">현재 위치를 출발지로 쓸까요?</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            사용하기를 눌렀을 때만 위치 권한을 요청합니다. 좌표를 반영한 뒤 주소를 확인해요.
          </p>
          {status === 'success' && <p className="mt-2 text-sm font-semibold text-primary">현재 위치를 출발지로 설정했어요.</p>}
          {status === 'error' && <p className="mt-2 text-sm font-semibold text-destructive">현재 위치를 가져오지 못했어요. 권한과 브라우저 설정을 확인해 주세요.</p>}
        </div>
      </div>

      <div className="flex shrink-0 gap-2 sm:self-center">
        <button
          type="button"
          onClick={dismiss}
          className="touch-target min-h-11 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-background hover:text-foreground"
        >
          닫기
        </button>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={status === 'loading'}
          className="touch-target min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
        >
          {status === 'loading' ? '확인 중…' : '사용하기'}
        </button>
      </div>
    </div>
  )
}
