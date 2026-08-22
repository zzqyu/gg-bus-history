import React from 'react'
import { Group } from '../../types'
import { StationNameTooltip, stationNameClass } from './StationNameTooltip'

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
 * 도보→버스→도보 여정 요약. 세 덩어리(출발 정류장+도보 / 버스 / 도착 정류장+도보)를
 * 3열 그리드에 각각 2줄로 배치한다 — 한 줄로는 실제 정류장명 길이 때문에 다 안 들어가고,
 * 예전처럼 flex-wrap 한 줄에 맡기면 줄바꿈 지점이 데이터마다 들쭉날쭉했다.
 * 정류장명 축약(10자)·작은 폰트(8자 이상)·툴팁은 통합시간이력(TimetableView)과 동일한
 * StationNameTooltip을 그대로 재사용해 두 화면에서 동작이 어긋나지 않게 한다.
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
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-x-2 text-xs leading-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1">
            <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-origin px-0.5 text-[9px] font-bold text-white">
              A{boardStationNumber ?? '-'}
            </span>
            <StationNameTooltip
              name={group.board.stationName}
              className={`font-semibold text-foreground ${stationNameClass(group.board.stationName)}`}
            />
          </div>
          <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-muted-foreground">
            도보{walkStartMin}분
            <WalkLinkIcon href={group.walk?.startToBoard?.kakaoUrl} label="출발지 → 승차 정류장 도보 경로" />
          </div>
        </div>

        <div className="shrink-0 text-center">
          {orderGapText && <div className="whitespace-nowrap font-semibold text-foreground">{orderGapText}</div>}
          <div className="whitespace-nowrap text-muted-foreground">버스{busDurationText}</div>
        </div>

        <div className="min-w-0 text-right">
          <div className="flex min-w-0 items-center justify-end gap-1">
            <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-alight px-0.5 text-[9px] font-bold text-white">
              B{alightStationNumber ?? '-'}
            </span>
            <StationNameTooltip
              name={group.alight.stationName}
              className={`font-semibold text-foreground ${stationNameClass(group.alight.stationName)}`}
            />
          </div>
          <div className="mt-0.5 flex items-center justify-end gap-1 whitespace-nowrap text-muted-foreground">
            도보{walkEndMin}분
            <WalkLinkIcon href={group.walk?.alightToEnd?.kakaoUrl} label="하차 정류장 → 목적지 도보 경로" />
          </div>
        </div>
      </div>

      <div className="mt-1 flex h-1 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
        {walkStartMin > 0 && <div className="bg-slate-500" style={{ width: segmentWidth(walkStartMin) }} />}
        {busMin > 0 && <div className="bg-route-line" style={{ width: segmentWidth(busMin) }} />}
        {walkEndMin > 0 && <div className="bg-slate-500" style={{ width: segmentWidth(walkEndMin) }} />}
      </div>
    </div>
  )
}
