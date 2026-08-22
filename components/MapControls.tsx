import React from 'react'

interface MapControlsProps {
  startRadius: string
  endRadius: string
  onStartRadiusChange: (v: string) => void
  onEndRadiusChange: (v: string) => void
}

export default function MapControls({
  startRadius,
  endRadius,
  onStartRadiusChange,
  onEndRadiusChange,
}: MapControlsProps) {
  return (
    <div className="mb-2 space-y-2 rounded-none border-0 bg-transparent p-0 sm:rounded-lg sm:border sm:border-border sm:bg-muted/40 sm:p-3">
      <div className="flex items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs sm:text-sm">
          <strong className="shrink-0 text-xs sm:text-sm">출발 반경</strong>
          <input
            type="range"
            min="100"
            max="2000"
            step="50"
            value={startRadius}
            onChange={(e) => onStartRadiusChange(e.target.value)}
            className="min-w-0 flex-1 accent-primary"
          />
          <span className="shrink-0 text-primary font-semibold">{startRadius}m</span>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs sm:text-sm">
          <strong className="shrink-0 text-xs sm:text-sm">도착 반경</strong>
          <input
            type="range"
            min="100"
            max="2000"
            step="50"
            value={endRadius}
            onChange={(e) => onEndRadiusChange(e.target.value)}
            className="min-w-0 flex-1 accent-primary"
          />
          <span className="shrink-0 text-primary font-semibold">{endRadius}m</span>
        </label>
      </div>
    </div>
  )
}
