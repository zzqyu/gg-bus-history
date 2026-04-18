import React from 'react'

interface MapControlsProps {
  startRadius: string
  endRadius: string
  onStartRadiusChange: (v: string) => void
  onEndRadiusChange: (v: string) => void
  onFocusStartEnd: () => void
  onMoveToCurrentLocation: () => void
  locatingMap?: boolean
}

export default function MapControls({
  startRadius,
  endRadius,
  onStartRadiusChange,
  onEndRadiusChange,
  onFocusStartEnd,
  onMoveToCurrentLocation,
  locatingMap = false,
}: MapControlsProps) {
  return (
    <div className="mb-2 space-y-2 rounded-none border-0 bg-transparent p-0 sm:rounded-md sm:border sm:border-slate-200 sm:bg-slate-50/60 sm:p-2">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-xs sm:text-sm">지도 핀 설정 (대체 입력)</strong>
        <button
          className="btn-ui"
          type="button"
          onClick={onFocusStartEnd}
        >
          한눈에 보기
        </button>
        <button
          className="btn-ui disabled:opacity-50"
          type="button"
          onClick={onMoveToCurrentLocation}
          disabled={locatingMap}
          title="현재 위치로 지도 이동"
        >
          {locatingMap ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-transparent" aria-hidden="true" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M21 10c0 6-9 13-9 13S3 16 3 10a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          )} 현재 위치
        </button>
        <span className="text-[11px] text-slate-600">검색 대신 지도에서 직접 지정할 수 있어요.</span>
      </div>

      <div className="flex flex-col gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex items-center gap-1.5 text-xs sm:text-sm">
          <strong className="text-xs sm:text-sm">출발 반경</strong>
          <input
            type="range"
            min="100"
            max="2000"
            step="50"
            value={startRadius}
            onChange={(e) => onStartRadiusChange(e.target.value)}
          />
          <span>{startRadius}m</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs sm:text-sm">
          <strong className="text-xs sm:text-sm">도착 반경</strong>
          <input
            type="range"
            min="100"
            max="2000"
            step="50"
            value={endRadius}
            onChange={(e) => onEndRadiusChange(e.target.value)}
          />
          <span>{endRadius}m</span>
        </label>
      </div>
    </div>
  )
}
