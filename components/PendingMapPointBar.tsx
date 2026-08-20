import React from 'react'
import { PendingMapPoint } from '../types'

interface PendingMapPointBarProps {
  point: PendingMapPoint
  onSetStart: () => void
  onSetEnd: () => void
  onClear: () => void
}

export default function PendingMapPointBar({
  point,
  onSetStart,
  onSetEnd,
  onClear,
}: PendingMapPointBarProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2">
      <span className="text-sm text-foreground">
        선택 좌표: ({point.lon}, {point.lat})
      </span>
      <button
        className="btn-ui"
        type="button"
        onClick={onSetStart}
      >
        출발지로 설정
      </button>
      <button
        className="btn-ui"
        type="button"
        onClick={onSetEnd}
      >
        도착지로 설정
      </button>
      <button
        className="btn-ui"
        type="button"
        onClick={onClear}
      >
        취소
      </button>
    </div>
  )
}
