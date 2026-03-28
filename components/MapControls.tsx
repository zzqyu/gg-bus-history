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
        className="mr-2 rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
        type="button"
        onClick={onFocusStartEnd}
      >
        출발/도착 한눈에 보기
      </button>
      <button
        className="mr-2 rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
        type="button"
        onClick={onMoveToCurrentLocation}
        disabled={locatingMap}
        title="현재 위치로 지도 이동"
      >
        {locatingMap ? '⏳' : '📍'} 현재 위치
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
