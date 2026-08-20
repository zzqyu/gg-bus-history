import React from 'react'

export type ArrivalSource = 'realtime' | 'history'

/**
 * 대표 출발값("N분 후 출발") 옆에 항상 붙는 출처 배지.
 * 색만으로 구분하지 않고 "실시간 반영"/"이력 기준" 텍스트를 항상 포함한다.
 * (근거: research/codex/FINDINGS.md §9 P0)
 */
export default function SourceBadge({ source }: { source: ArrivalSource }) {
  if (source === 'realtime') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-badge-realtime-border bg-badge-realtime-bg px-1.5 py-0.5 text-[11px] font-bold text-badge-realtime-fg">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
        실시간 반영
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-badge-history-border bg-badge-history-bg px-1.5 py-0.5 text-[11px] font-bold text-badge-history-fg">
      이력 기준
    </span>
  )
}
