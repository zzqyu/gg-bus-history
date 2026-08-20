import React from 'react'
import { Group } from '../../types'

interface JourneySummaryProps {
  group: Group
  boardStationNumber?: number | null
  alightStationNumber?: number | null
  orderGapText?: string | null
  busDurationText: string
  busMinutes: number | null
}

function minutesFromSeconds(seconds?: number): number {
  const sec = Number(seconds)
  return Number.isFinite(sec) && sec >= 0 ? Math.max(0, Math.round(sec / 60)) : 0
}

/**
 * 도보 경로 딥링크 — 아이콘만 두되, "도보 N분" 텍스트 바로 옆에 붙여서 맥락을 준다
 * (라운드 3에서 지적된 "맥락 없는 아이콘"을 재현하지 않기 위한 최소 형태).
 */
function WalkLinkIcon({ href, label }: { href?: string; label: string }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(ev) => ev.stopPropagation()}
      title={label}
      aria-label={label}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted"
    >
      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
        <path d="M14 5h5v5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 14 19 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 14v5h-14v-14h5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  )
}

/**
 * 도보→버스→도보 여정 요약. P3-T11에서 박스형(정류장명 2줄 그리드)으로 만들었다가,
 * P3-T13(카드 압축 라운드)에서 한 줄 텍스트 + 얇은 비례 바로 다시 압축했다.
 *
 * P6-T1(사용자 피드백) — 두 가지를 바꿨다:
 * 1. 순서를 "도보 → 정류장" 순으로(이동 순서와 일치): 출발 구간은 "도보Xm+아이콘 → A정류장",
 *    도착 구간은 "B정류장 → 도보Xm+아이콘"으로 대칭 배치.
 * 2. 각 논리적 덩어리(도보+아이콘, 배지+정류장명, 버스+정거장)를 `whitespace-nowrap` span으로
 *    묶어서, 좁은 화면에서 줄바꿈이 덩어리 중간에서 끊기지 않고 덩어리 단위로만 일어나게 했다.
 */
export default function JourneySummary({
  group,
  boardStationNumber,
  alightStationNumber,
  orderGapText,
  busDurationText,
  busMinutes,
}: JourneySummaryProps) {
  const walkStartMin = minutesFromSeconds(group.walk?.startToBoard?.timeSec)
  const walkEndMin = minutesFromSeconds(group.walk?.alightToEnd?.timeSec)
  const busMin = Math.max(0, Math.round(Number(busMinutes) || 0))
  const total = Math.max(1, walkStartMin + busMin + walkEndMin)
  const segmentWidth = (value: number) => `${Math.max(value > 0 ? 6 : 0, Math.round((value / total) * 100))}%`

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4">
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
          <span className="text-muted-foreground">도보{walkStartMin}분</span>
          <WalkLinkIcon href={group.walk?.startToBoard?.kakaoUrl} label="출발지 → 승차 정류장 도보 경로" />
        </span>
        <span className="inline-flex min-w-0 shrink items-center gap-1 whitespace-nowrap">
          <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-origin px-0.5 text-[9px] font-bold text-white">
            A{boardStationNumber ?? '-'}
          </span>
          <span className="max-w-[8rem] truncate font-semibold text-foreground" title={group.board.stationName}>
            {group.board.stationName}
          </span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground">·</span>
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
          <span className="font-semibold text-route-line">버스{busDurationText}</span>
          {orderGapText && <span className="text-muted-foreground">({orderGapText})</span>}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">·</span>
        <span className="inline-flex min-w-0 shrink items-center gap-1 whitespace-nowrap">
          <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-alight px-0.5 text-[9px] font-bold text-white">
            B{alightStationNumber ?? '-'}
          </span>
          <span className="max-w-[8rem] truncate font-semibold text-foreground" title={group.alight.stationName}>
            {group.alight.stationName}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
          <span className="text-muted-foreground">도보{walkEndMin}분</span>
          <WalkLinkIcon href={group.walk?.alightToEnd?.kakaoUrl} label="하차 정류장 → 목적지 도보 경로" />
        </span>
      </div>

      <div className="mt-1 flex h-1 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
        {walkStartMin > 0 && <div className="bg-slate-500" style={{ width: segmentWidth(walkStartMin) }} />}
        {busMin > 0 && <div className="bg-route-line" style={{ width: segmentWidth(busMin) }} />}
        {walkEndMin > 0 && <div className="bg-slate-500" style={{ width: segmentWidth(walkEndMin) }} />}
      </div>
    </div>
  )
}
