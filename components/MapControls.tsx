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
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <strong>지도 핀 지정:</strong>
      <button
        className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 text-sm"
        type="button"
        onClick={onFocusStartEnd}
      >
        출발/도착 한눈에 보기
      </button>
      <button
        className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 text-sm disabled:opacity-50"
        type="button"
        onClick={onMoveToCurrentLocation}
        disabled={locatingMap}
        title="현재 위치로 지도 이동"
      >
        {locatingMap ? (
          <span className="inline-block h-4 w-4 rounded-full border-2 border-t-transparent border-slate-700 animate-spin" aria-hidden="true" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M21 10c0 6-9 13-9 13S3 16 3 10a9 9 0 0118 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        )} 현재 위치
      </button>
      <label className="flex items-center gap-1.5">
        <strong>출발 반경</strong>
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
      <label className="flex items-center gap-1.5">
        <strong>도착 반경</strong>
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
      <span className="text-slate-500">지도를 클릭한 뒤 출발지/도착지를 선택하세요.</span>
    </div>
  )
}
