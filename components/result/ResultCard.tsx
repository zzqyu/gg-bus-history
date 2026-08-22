import React from 'react'
import { Group, RealtimeArrivalItem, StationNumberMaps, TimetableEntry } from '../../types'
import { formatDisplayTime, getServiceDayNowMinutes } from '../../utils/timeUtils'
import { canDisplaySeatCount, getRouteTypeClass, getRouteTypeLabel } from '../../utils/styleUtils'
import { getBoardStationNumber, getAlightStationNumber } from '../../utils/stationNumberUtils'
import {
  buildRealtimeCongestionText,
  buildRealtimeLocationText,
  buildRealtimeOccupancyText,
  getOccupancyTone,
  isLowFloorBus,
  shouldEmphasizeRealtime,
} from '../../utils/realtimeUtils'
import { getGroupRouteBadges } from '../../utils/routeUtils'
import RouteBadge from './RouteBadge'
import SourceBadge from './SourceBadge'
import JourneySummary from './JourneySummary'

interface ResultCardProps {
  group: Group
  index: number
  sday: string
  combined: TimetableEntry[]
  realtimeByRouteId?: Record<string, RealtimeArrivalItem | null | undefined>
  stationNumberMaps?: StationNumberMaps
  selectedRouteId?: string | null
  onSelectRoute?: (routeId: string | null) => void
  onCardClick?: () => void
  /** true면(카드를 선택해 focused-card로 보고 있을 때) 노선 배지를 눌러 필터링할 수 있다.
   * 목록에 여러 카드가 함께 보일 때는 false로 둬서 배지 클릭이 안 먹히게 한다. */
  focused?: boolean
}

function parseDisplayMinutes(text: string): number | null {
  const m = String(text).match(/^(\d+):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** inference_confidence 원시값("high"/"medium"/"low")을 사람이 읽는 한국어로. */
function formatConfidenceLabel(v?: string | null): string {
  const s = String(v || '').trim().toLowerCase()
  if (s === 'high') return '높음'
  if (s === 'medium' || s === 'mid') return '보통'
  if (s === 'low') return '낮음'
  return v ? String(v) : '-'
}

/**
 * 결과 카드 (Phase 4 프로덕션 버전). `components/preview/claude2/ResultCard.tsx`(P3-T9~T13)를
 * 그대로 승격했다 — 이미 props 기반이라 로직 변경 없음. `pages/index.tsx`는 P4-T1에서 연결한다.
 * 기존 `components/result/RouteResultCard.tsx`를 대체한다(P4-T1에서 실제 삭제).
 *
 * `RouteResultCard.tsx`(B안 확정판) 대비 바뀐 점(연혁):
 * 1. 통합 프레이밍: 상단에 "N개 노선 통합" 표시(리스트 배너는 LayoutClaude2에서 담당)
 * 2. 하차 예상시각을 3차(Collapsible) 밖으로 끌어올려 2차 정보로 항상 노출
 * 3. "N분 후 출발" 옆에 출처 배지(SourceBadge)를 항상 표시
 * 4. "추정 n%"를 "하차시각 추정 · 신뢰도 n%"로 재명명하고 하차 패널에만 배치
 *
 * P3-T11(사용자 피드백 반영) 추가 변경:
 * 5. `JourneyTimeline` 대신 `JourneySummary`(도보/버스/도보 요약 줄 + 비례 바 + 도보 경로 버튼)
 * 6. "이 카드가 어떤 노선들로 구성됐는지"를 Collapsible 밖으로 꺼내 항상 노출(피드백 #3)
 *
 * P3-T13(카드 압축 라운드) 추가 변경 — 정보는 그대로, 세로 공간만 줄였다:
 * 7. 하차 예상 박스의 패딩/캡션 문장을 줄임(강조 폰트 크기는 유지)
 * 8. 노선 목록을 줄바꿈 대신 가로 스크롤 한 줄로 고정(노선이 많아도 카드 높이 불변)
 */
export default function ResultCard({
  group,
  index,
  sday,
  combined,
  realtimeByRouteId = {},
  stationNumberMaps,
  selectedRouteId = null,
  onSelectRoute,
  onCardClick,
  focused = false,
}: ResultCardProps) {
  const walkStartMin = Math.max(0, Math.round(Number(group.walk?.startToBoard?.timeSec || 0) / 60))
  const walkEndMin = Math.max(0, Math.round(Number(group.walk?.alightToEnd?.timeSec || 0) / 60))

  const now = new Date()
  const nowMin = getServiceDayNowMinutes(now)
  const earliestBoardMin = nowMin + walkStartMin

  const filteredCombined = selectedRouteId
    ? (combined || []).filter((e) => String(e.routeId || '') === String(selectedRouteId))
    : combined

  const timelineCandidates = (filteredCombined || [])
    .map((entry) => {
      const boardText = formatDisplayTime(entry.boardTime, sday)
      const alightText = formatDisplayTime(entry.alightTime, sday)
      const boardMin = parseDisplayMinutes(boardText)
      const alightMin = parseDisplayMinutes(alightText)
      if (boardMin == null || alightMin == null || alightMin < boardMin) return null
      return { entry, boardText, alightText, boardMin, alightMin }
    })
    .filter((v): v is NonNullable<typeof v> => !!v)

  const selectableCandidates = timelineCandidates.filter((x) => x.boardMin >= earliestBoardMin)
  const hasFutureService = selectableCandidates.length > 0
  const hasAnyTimeline = timelineCandidates.length > 0
  const serviceEnded = hasAnyTimeline && !hasFutureService

  const bestTimeline = hasFutureService
    ? selectableCandidates.sort((a, b) => a.alightMin - b.alightMin || a.boardMin - b.boardMin)[0]
    : null

  const routeBadges = getGroupRouteBadges(group)
  // 선택 상태와 관계없이 노선 번호 오름차순을 유지한다.
  const orderedRouteBadges = routeBadges

  const bestRouteId = bestTimeline?.entry?.routeId ? String(bestTimeline.entry.routeId) : null
  const bestRouteInfo = (group.routes || []).find((r) => String(r.routeId || '') === String(bestRouteId || ''))
  const bestBusMin = bestTimeline ? Math.max(0, bestTimeline.alightMin - bestTimeline.boardMin) : null

  const fallbackRoute = selectedRouteId
    ? routeBadges.find((r) => r.routeId === selectedRouteId) ?? routeBadges[0]
    : routeBadges[0]
  const displayRouteName = bestTimeline?.entry.routeName || bestRouteId || fallbackRoute?.routeName || '-'
  const displayRouteTypeCd = bestRouteInfo?.routeTypeCd ?? fallbackRoute?.routeTypeCd

  const realtimeItem = bestRouteId ? realtimeByRouteId[bestRouteId] : null
  const realtimeMin = realtimeItem?.predictTime1 ?? null
  const realtimeBoardMin = realtimeMin != null ? nowMin + Math.round(realtimeMin) : null

  const effectiveBoardMin = realtimeBoardMin ?? bestTimeline?.boardMin ?? null
  const emphasizeDelay = shouldEmphasizeRealtime(bestTimeline?.boardMin ?? null, realtimeMin, 7)

  const walkStartCountdownMin =
    effectiveBoardMin != null ? Math.max(0, effectiveBoardMin - nowMin - walkStartMin) : null

  const departureText = serviceEnded
    ? '운행 종료'
    : walkStartCountdownMin == null
      ? '-'
      : walkStartCountdownMin <= 0
        ? '지금 출발'
        : `${walkStartCountdownMin}분 후 출발`

  const totalMinText = serviceEnded
    ? '운행 종료'
    : bestBusMin == null
      ? '-'
      : `${bestBusMin + walkStartMin + walkEndMin}분`

  const busDurationText = serviceEnded ? '운행 종료' : bestBusMin != null ? `${bestBusMin}분` : '-'

  const historyBoardText = serviceEnded ? '운행 종료' : bestTimeline?.boardText ?? '-'
  const historyAlightText = serviceEnded ? '운행 종료' : bestTimeline?.alightText ?? '-'
  const realtimeBoardClockText =
    realtimeBoardMin != null
      ? `${String(Math.floor(realtimeBoardMin / 60)).padStart(2, '0')}:${String(realtimeBoardMin % 60).padStart(2, '0')}`
      : ''

  const fallbackRouteInfo = (group.routes || []).find((r) => String(r.routeId || '') === String(fallbackRoute?.routeId || ''))
  const orderGap = bestRouteInfo?.orderGap ?? fallbackRouteInfo?.orderGap
  const orderGapText = orderGap != null && Number.isFinite(Number(orderGap)) ? `${orderGap}정거장` : null

  const locationText = buildRealtimeLocationText(realtimeItem)
  const isLowFloor = isLowFloorBus(realtimeItem)
  // 좌석수는 좌석/직행좌석/광역급행 등 실제 좌석 데이터가 유효한 노선에서만 보여준다.
  // 그 외 노선은 좌석수 없이 혼잡도만 표시한다.
  const seatEligible = !!bestRouteInfo && canDisplaySeatCount(bestRouteInfo.routeTypeCd)
  const occupancyText = seatEligible
    ? buildRealtimeOccupancyText(realtimeItem)
    : buildRealtimeCongestionText(realtimeItem)
  const occupancyTone = getOccupancyTone(realtimeItem, 1, seatEligible)

  const routeTypeLabel = getRouteTypeLabel(displayRouteTypeCd)
  const routeTypeClass = getRouteTypeClass(displayRouteTypeCd)

  const boardStationNumber = stationNumberMaps
    ? getBoardStationNumber(stationNumberMaps, group.board.stationId, group.board.stationName)
    : null
  const alightStationNumber = stationNumberMaps
    ? getAlightStationNumber(stationNumberMaps, group.alight.stationId, group.alight.stationName)
    : null

  // 필수 반영 #3 — 대표 출발값 옆 출처 배지. 실시간 예측이 잡히면 실시간, 아니면 이력 기준.
  const arrivalSource: 'realtime' | 'history' = realtimeBoardMin != null ? 'realtime' : 'history'
  const isInferredAlight = !serviceEnded && !!bestTimeline?.entry.inferred

  return (
    <div
      onClick={onCardClick}
      data-group-key={`${group.board.stationId}-${group.alight.stationId}`}
      className="mb-2 cursor-pointer rounded-lg border border-border bg-background p-2.5 shadow-sm"
    >
      {/* 1차: 한눈에 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">결과 {index + 1}</span>
            <span className="text-[10px] font-semibold text-muted-foreground">{routeBadges.length}개 노선 통합</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-lg font-extrabold ${routeTypeClass}`}>{displayRouteName}</span>
            {routeTypeLabel && <span className="text-xs font-semibold text-muted-foreground">{routeTypeLabel}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-bold text-foreground">{departureText}</span>
            {!serviceEnded && <SourceBadge source={arrivalSource} />}
            {locationText && <span className="text-xs text-muted-foreground">· {locationText}</span>}
            {isLowFloor && (
              <span className="rounded border border-border px-1 text-[10px] font-semibold text-muted-foreground" title="저상버스">
                저상
              </span>
            )}
          </div>
          {emphasizeDelay && !serviceEnded && (
            <p className="mt-0.5 text-[11px] font-semibold text-badge-delayed-fg">실시간이 이력보다 7분 이상 차이나요</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] text-muted-foreground">총 소요</div>
          <div className="text-lg font-extrabold">{totalMinText}</div>
        </div>
      </div>

      {/* 2차 A: 스캔 — 도보→버스→도보 요약 (필수 반영 #2, 피드백 #1/#2/#5) */}
      <JourneySummary
        group={group}
        boardStationNumber={boardStationNumber}
        alightStationNumber={alightStationNumber}
        orderGapText={orderGapText}
        busDurationText={busDurationText}
        busMinutes={bestBusMin}
      />

      {/* 2차 B: 하차 예상시각(컴팩트, HH:MM 폭에 맞춤) + 이력·실시간·좌석 상세를 한 줄에 배치.
          하차 예상 박스를 줄여서 생긴 오른쪽 공간에 상세 정보를 둔다(더 이상 별도 줄로 안 뺀다). */}
      <div className="mt-1.5 flex items-stretch gap-1.5">
        <div className="flex shrink-0 items-center rounded-md border-2 border-alight/30 bg-alight/5 px-2.5 py-1.5">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground">하차 예상</div>
            <div className="text-lg font-extrabold leading-tight text-foreground">{historyAlightText}</div>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 rounded border border-border px-2 py-1.5 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">이력 탑승</span>
            <span className="inline-block rounded border border-badge-history-border bg-badge-history-bg px-1.5 py-0.5 font-semibold text-badge-history-fg">
              {historyBoardText}
            </span>
          </span>
          {realtimeBoardClockText && (
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">실시간 탑승</span>
              <span
                className={`inline-block rounded border px-1.5 py-0.5 font-semibold ${
                  emphasizeDelay
                    ? 'border-badge-delayed-border bg-badge-delayed-bg text-badge-delayed-fg'
                    : 'border-badge-realtime-border bg-badge-realtime-bg text-badge-realtime-fg'
                }`}
              >
                {realtimeBoardClockText}
              </span>
            </span>
          )}
          {occupancyText && (
            <span className={`font-semibold ${occupancyTone}`}>{occupancyText}</span>
          )}
          {isInferredAlight && (
            <span
              className="shrink-0 rounded border border-badge-inferred-border bg-badge-inferred-bg px-1.5 py-0.5 font-semibold text-badge-inferred-fg"
              title={`추정 방식: ${bestTimeline?.entry.inference_method ?? '-'}`}
            >
              하차 추정 · {formatConfidenceLabel(bestTimeline?.entry.inference_confidence)}
            </span>
          )}
        </div>
      </div>

      {/* 2차 C: 이 카드의 노선 목록 — 2개 이상일 때만 노출(피드백 #3). 노선이 1개면 위쪽
          대표 노선 표시와 중복이라 생략한다. 가로 스크롤 한 줄로 고정해 카드 높이가
          노선 개수에 영향받지 않게 한다(P3-T13) */}
      {orderedRouteBadges.length > 1 && (
        <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto overflow-y-hidden pb-0.5">
          <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">노선</span>
          {orderedRouteBadges.map((r) => (
            <RouteBadge
              key={r.routeId}
              route={r}
              size="xs"
              disabled={!focused}
              selected={selectedRouteId === r.routeId}
              onClick={(routeId) => onSelectRoute?.(selectedRouteId === routeId ? null : routeId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
