import React from 'react'
import { Group, GroupTimetableState, RealtimeArrivalItem, RouteBadgeInfo, StationNumberMaps, TimetableEntry } from '../types'
import { getRouteNameStyle } from '../utils/styleUtils'
import { formatDisplayTime, formatSecondsToMinuteText, getServiceDayNowMinutes } from '../utils/timeUtils'
import { getAlightStationNumber, getBoardStationNumber } from '../utils/stationNumberUtils'
import { buildRealtimeClockText, buildRealtimeKey, getBestTimelineMinutes, matchRealtimeToTimetableRows, parseRealtimeItemResponse, shouldEmphasizeRealtime } from '../utils/realtimeUtils'
import GroupTimetable from './GroupTimetable'
import RealtimeArrivalPanel from './RealtimeArrivalPanel'

interface GroupCardProps {
  groupKey: string
  group: Group
  index: number
  isExpanded: boolean
  prefetchingBusDuration: boolean
  prefetchedBusDurationText: string | null
  sday: string
  timetableState: GroupTimetableState | undefined
  timetableHidden: boolean
  combined: TimetableEntry[]
  prefetchedCombined: TimetableEntry[]
  highlightedRowIndex: number
  visibleRouteBadges: RouteBadgeInfo[]
  stationNumberMaps: StationNumberMaps
  tableScrollRef: (el: HTMLDivElement | null) => void
  badgeRowRef: (el: HTMLDivElement | null) => void
  onCardClick: (e: React.MouseEvent) => void
  onToggleTimetable: () => void
  onFetchTimetable: () => void
  onRouteBadgeClick: (routeId: string) => void
  onSelectRoute: (routeId: string | null) => void
  onMoveToCurrentTime: () => void
  onFoldTimetable: () => void
}

export default function GroupCard({
  groupKey,
  group,
  index,
  isExpanded,
  prefetchingBusDuration,
  prefetchedBusDurationText,
  sday,
  timetableState,
  timetableHidden,
  combined,
  prefetchedCombined,
  highlightedRowIndex,
  visibleRouteBadges,
  stationNumberMaps,
  tableScrollRef,
  badgeRowRef,
  onCardClick,
  onToggleTimetable,
  onFetchTimetable,
  onRouteBadgeClick,
  onSelectRoute,
  onMoveToCurrentTime,
  onFoldTimetable,
}: GroupCardProps) {
  const walkStartMin = Math.max(0, Math.round(Number(group.walk?.startToBoard?.timeSec || 0) / 60))
  const walkEndMin = Math.max(0, Math.round(Number(group.walk?.alightToEnd?.timeSec || 0) / 60))
  const walkStartDistance = Math.max(0, Math.round(Number(group.walk?.startToBoard?.distance || 0)))
  const walkEndDistance = Math.max(0, Math.round(Number(group.walk?.alightToEnd?.distance || 0)))

  const startWalkKakaoUrl = group.walk?.startToBoard?.kakaoUrl || null
  const endWalkKakaoUrl = group.walk?.alightToEnd?.kakaoUrl || null

  function parseDisplayMinutes(text: string): number | null {
    const m = String(text).match(/^(\d+):(\d{2})$/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }

  function formatMinuteText(totalMinutes: number): string {
    const safe = Number.isFinite(totalMinutes) ? Math.max(0, Math.floor(totalMinutes)) : 0
    const h = Math.floor(safe / 60)
    const m = safe % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  function formatDistanceText(distanceM: number): string {
    if (!Number.isFinite(distanceM) || distanceM <= 0) return '0m'
    if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(2)}km`
    return `${distanceM}m`
  }

  const sourceEntries = (combined && combined.length > 0) ? combined : (prefetchedCombined || [])

  const busMinutes = (sourceEntries || [])
    .map((entry) => {
      if (!entry.boardTime || !entry.alightTime) return Number.NaN
      const board = new Date(String(entry.boardTime).replace(' ', 'T'))
      const alight = new Date(String(entry.alightTime).replace(' ', 'T'))
      if (Number.isNaN(board.getTime()) || Number.isNaN(alight.getTime())) return Number.NaN
      const diffMin = Math.floor((alight.getTime() - board.getTime()) / 60000)
      return diffMin >= 0 ? diffMin : Number.NaN
    })
    .filter((v) => Number.isFinite(v)) as number[]

  const busDurationRangeText = (() => {
    if (busMinutes.length === 0) return '-'
    const min = Math.min(...busMinutes)
    const max = Math.max(...busMinutes)
    if (min === max) return `${min}분`
    return `${min}~${max}분`
  })()

  const busDurationText = prefetchedBusDurationText || busDurationRangeText
  const showBusDurationSpinner = prefetchingBusDuration && !prefetchedBusDurationText

  const now = new Date()
  const nowMinutes = getServiceDayNowMinutes(now)
  const earliestBoardMinutes = nowMinutes + walkStartMin

  const timelineCandidates = (sourceEntries || [])
    .map((entry) => {
      const boardText = formatDisplayTime(entry.boardTime, sday)
      const alightText = formatDisplayTime(entry.alightTime, sday)
      const boardMin = parseDisplayMinutes(boardText)
      const alightMin = parseDisplayMinutes(alightText)
      if (boardMin == null || alightMin == null || alightMin < boardMin) return null
      return { entry, boardText, alightText, boardMin, alightMin }
    })
    .filter((v): v is NonNullable<typeof v> => !!v)

  const selectableCandidates = timelineCandidates.filter((x) => x.boardMin >= earliestBoardMinutes)
  const hasFutureService = selectableCandidates.length > 0
  const hasAnyTimeline = timelineCandidates.length > 0
  const serviceEnded = hasAnyTimeline && !hasFutureService
  const bestTimeline = hasFutureService
    ? selectableCandidates.sort((a, b) => (a.alightMin - b.alightMin) || (a.boardMin - b.boardMin))[0]
    : null

  const bestRouteId = bestTimeline?.entry?.routeId ? String(bestTimeline.entry.routeId) : null
  const bestBusMin = bestTimeline ? Math.max(0, bestTimeline.alightMin - bestTimeline.boardMin) : null
  const departText = serviceEnded ? '운행종료' : (bestTimeline ? formatMinuteText(bestTimeline.boardMin - walkStartMin) : '-')
  const boardText = serviceEnded ? '운행종료' : (bestTimeline ? bestTimeline.boardText : '-')
  const alightText = serviceEnded ? '운행종료' : (bestTimeline ? bestTimeline.alightText : '-')
  const arriveText = serviceEnded ? '운행종료' : (bestTimeline ? formatMinuteText(bestTimeline.alightMin + walkEndMin) : '-')
  const totalMinText = serviceEnded ? '운행종료' : (bestBusMin == null ? '-' : `${bestBusMin + walkStartMin + walkEndMin}분`)

  const WalkIcon = (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <circle cx="12" cy="4.5" r="2" fill="currentColor" />
      <path d="M10.5 8.5l-2 3.5 2.5 2.5-2 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.2 8.5l2.3 2.5 3 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.2 12l3.2 2.3-.7 5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

  const BusIcon = (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <rect x="5" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 16v2M16 16v2M6 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="18.5" r="1" fill="currentColor" />
      <circle cx="15" cy="18.5" r="1" fill="currentColor" />
    </svg>
  )

  const [realtime, setRealtime] = React.useState<RealtimeArrivalItem | null>(null)
  const [realtimeLoading, setRealtimeLoading] = React.useState(false)
  const [realtimeError, setRealtimeError] = React.useState('')
  const [arrivalPanelOpen, setArrivalPanelOpen] = React.useState(false)
  const [arrivalPanelStationType, setArrivalPanelStationType] = React.useState<'board' | 'alight'>('board')

  const bestRouteInfo = (group.routes || []).find((r) => String(r.routeId || '') === String(bestRouteId || ''))

  React.useEffect(() => {
    let canceled = false
    async function run() {
      if (!bestRouteId || !group.board?.stationId || bestRouteInfo?.boardOrder == null) {
        setRealtime(null)
        setRealtimeError('')
        return
      }
      setRealtimeLoading(true)
      setRealtimeError('')
      try {
        const params = new URLSearchParams({
          stationId: String(group.board.stationId),
          routeId: String(bestRouteId),
          staOrder: String(bestRouteInfo.boardOrder),
        })
        const r = await fetch('/api/realtimeArrivalItem?' + params.toString())
        const j = await r.json()
        const parsed = parseRealtimeItemResponse(j)
        if (!canceled) setRealtime(parsed)
      } catch (e) {
        if (!canceled) {
          setRealtime(null)
          setRealtimeError(String(e))
        }
      } finally {
        if (!canceled) setRealtimeLoading(false)
      }
    }
    run()
    return () => { canceled = true }
  }, [bestRouteId, group.board?.stationId, bestRouteInfo?.boardOrder])

  const bestTimelineMin = getBestTimelineMinutes(sourceEntries, sday, walkStartMin)
  const realtimeMin = React.useMemo(() => {
    if (!bestTimeline || !bestRouteId || !group.board?.stationId || bestRouteInfo?.boardOrder == null) return null
    const predict = Array.isArray(realtime?.predictTimes) ? realtime.predictTimes : []
    if (!predict.length) return null

    const key = buildRealtimeKey(String(group.board.stationId), String(bestRouteId), bestRouteInfo.boardOrder)
    const rows = (sourceEntries || [])
      .map((entry, idx) => ({
        idx,
        key: buildRealtimeKey(entry.boardStationId || String(group.board.stationId), entry.routeId, entry.boardOrder),
        boardText: formatDisplayTime(entry.boardTime, sday),
      }))
      .filter((r) => r.key === key)

    if (!rows.length) return null

    const mapped = matchRealtimeToTimetableRows(rows.map((r) => r.boardText), predict)
    let rowPos = -1

    // 1) 가장 안정적인 기준: sourceEntries 내 원본 인덱스 일치
    const bestIdxInSource = (sourceEntries || []).findIndex((entry) => entry === bestTimeline.entry)
    if (bestIdxInSource >= 0) {
      rowPos = rows.findIndex((r) => r.idx === bestIdxInSource)
    }

    // 2) 폴백: 동일 보드표시시각 문자열 매칭
    if (rowPos < 0) {
      const targetBoardText = bestTimeline.boardText
      rowPos = rows.findIndex((r) => r.boardText === targetBoardText)
    }

    // 3) 마지막 폴백: 같은 key 내 첫 행(순차 매핑의 첫 대상)
    if (rowPos < 0) {
      rowPos = 0
    }

    return mapped[rowPos] ?? null
  }, [bestTimeline, bestRouteId, bestRouteInfo?.boardOrder, group.board?.stationId, realtime?.predictTimes, sday, sourceEntries])
  const realtimeClockText = buildRealtimeClockText(realtimeMin)
  const nextRealtimeClockText = buildRealtimeClockText(realtime?.predictTime1 ?? null)
  const showRealtimeMappingFallback = !realtimeLoading && !realtimeClockText && !!nextRealtimeClockText
  const emphasizeRealtime = shouldEmphasizeRealtime(bestTimelineMin, realtimeMin, 7)

  return (
    <div
      onClick={onCardClick}
      data-group-key={groupKey}
      className="mb-3 cursor-pointer rounded-lg p-3"
      style={{
        border: isExpanded ? '1px solid #2563eb' : '1px solid #ddd',
        background: isExpanded ? '#eff6ff' : '#fff',
      }}
    >
      {/* Card header */}
      <div className="relative mb-2 flex w-full items-center justify-between">
        <span className="rounded-[10px] bg-gray-900 px-2 py-0.5 text-xs font-bold text-white">
          결과 {index + 1}
        </span>

        <div className="pointer-events-none absolute left-1/2 top-1/2 w-max -translate-x-1/2 -translate-y-1/2 text-[11px] text-slate-700 text-center font-semibold whitespace-nowrap">
          예상 총 소요 {totalMinText}
        </div>
        <button
          type="button"
          title={timetableState && !timetableHidden ? '시간표 닫기' : '통합 시간이력'}
          aria-label={timetableState && !timetableHidden ? '시간표 닫기' : '통합 시간이력'}
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!sday}
          onClick={(ev) => {
            ev.stopPropagation()
            onToggleTimetable()
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </button>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2.5">
        <div className="grid grid-cols-[auto_minmax(0,0.7fr)_auto_minmax(0,2.2fr)_auto_minmax(0,0.7fr)_auto] items-start gap-1 text-[11px]">
          <div className='w-[24px]' />
          <div />
          <div className="relative h-4">
            <div className="absolute left-1/2 top-0 w-max max-w-[140px] -translate-x-1/2 truncate text-center text-slate-700" title={group.board.stationName}>
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                  A{getBoardStationNumber(stationNumberMaps, group.board.stationId, group.board.stationName) ?? '-'}
                </span>
                <span>{group.board.stationName}</span>
              </span>
            </div>
          </div>
          <div />
          <div className="relative h-4">
            <div className="absolute left-1/2 top-0 w-max max-w-[140px] -translate-x-1/2 truncate text-center text-slate-700" title={group.alight.stationName}>
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                  B{getAlightStationNumber(stationNumberMaps, group.alight.stationId, group.alight.stationName) ?? '-'}
                </span>
                <span>{group.alight.stationName}</span>
              </span>
            </div>
          </div>
          <div />
          <div className='w-[24px]' />
        </div>
        {/* 1줄: 그래프 */}
        <div className="grid grid-cols-[auto_minmax(0,0.7fr)_auto_minmax(0,2.2fr)_auto_minmax(0,0.7fr)_auto] items-center text-[11px] font-semibold text-slate-700">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-600 text-white">{WalkIcon}</span>
          <div className="h-2.5 rounded-r bg-slate-300 flex items-center justify-center">{formatSecondsToMinuteText(group.walk?.startToBoard?.timeSec)}</div>
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-600 text-white">{BusIcon}</span>
          <div className="h-2.5 rounded-r bg-indigo-300 flex items-center justify-center">
            {showBusDurationSpinner && !bestTimeline ? (
              <span className="inline-flex items-center gap-1">
                <svg className="h-3.5 w-3.5 animate-spin text-slate-500" viewBox="0 0 24 24" fill="none" aria-label="버스 소요시간 로딩 중">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-90" d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <span>불러오는 중</span>
              </span>
            ) : (
              serviceEnded ? '운행종료' : (bestBusMin != null ? `${bestBusMin}분` : busDurationText)
            )}
          </div>
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-600 text-white">{WalkIcon}</span>
          <div className="h-2.5 rounded-r bg-slate-300 flex items-center justify-center">{formatSecondsToMinuteText(group.walk?.alightToEnd?.timeSec)}</div>
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-600 text-white"></span>
        </div>
        <div className="-mt-0.5 grid grid-cols-[auto_minmax(0,0.7fr)_auto_minmax(0,2.2fr)_auto_minmax(0,0.7fr)_auto] items-center text-[10px] text-slate-500">
          <div className="h-2.5 w-[24px] flex items-center justify-center"></div>
          <div className="h-2.5 rounded-r flex items-center justify-center">{formatDistanceText(walkStartDistance)}{startWalkKakaoUrl && (
            <a
              href={startWalkKakaoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              onClick={(ev) => ev.stopPropagation()}
              title="출발지 → 탑승 정류장 도보 길찾기"
              aria-label="출발지 → 탑승 정류장 도보 길찾기 (외부 링크)"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" aria-hidden="true">
                <path d="M14 5h5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 14 19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19 14v5h-14v-14h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}</div>
          <div className="h-2.5 w-[24px] flex items-center justify-center"></div>
          <div className="h-2.5"></div>
          <div className="h-2.5 w-[24px] flex items-center justify-center"></div>
          <div className="h-2.5 rounded-r flex items-center justify-center">{formatDistanceText(walkEndDistance)}{endWalkKakaoUrl && (
            <a
              href={endWalkKakaoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              onClick={(ev) => ev.stopPropagation()}
              title="하차 정류장 → 도착지 도보 길찾기"
              aria-label="하차 정류장 → 도착지 도보 길찾기 (외부 링크)"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" aria-hidden="true">
                <path d="M14 5h5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 14 19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19 14v5h-14v-14h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}</div>
          <div className="h-2.5 w-[24px] flex items-center justify-center"></div>
        </div>
        <div className="-mt-0.1 grid grid-cols-[auto_minmax(0,0.7fr)_auto_minmax(0,2.2fr)_auto_minmax(0,0.7fr)_auto] items-start text-[11px] text-slate-700">
          <div className="text-center">{departText}</div>
          <div />
          <div className="text-center">
            <span className="inline-flex items-center gap-1">
              <span>{boardText}</span>
              {realtimeLoading ? (
                <span
                  className="rounded px-1 py-0.5 text-[10px] font-semibold"
                  style={{ background: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe' }}
                  title="실시간 도착 조회 중"
                >
                  ...
                </span>
              ) : (realtimeClockText ? (
                <span
                  className="rounded px-1 py-0.5 text-[10px] font-semibold"
                  style={emphasizeRealtime
                    ? { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }
                    : { background: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe' }}
                  title={realtimeError || '실시간 도착 시각'}
                >
                  {realtimeClockText}
                </span>
              ) : (showRealtimeMappingFallback ? (
                <span
                  className="rounded px-1 py-0.5 text-[10px] font-semibold"
                  style={{ background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74' }}
                  title="시간이력 행에 실시간 매핑이 없어 다음 실시간을 참고값으로 표시"
                >
                  {`매핑불가(다음 실시간 ${nextRealtimeClockText})`}
                </span>
              ) : null))}
            </span>
          </div>
          <div />
          <div className="text-center">{alightText}</div>
          <div />
          <div className="text-center whitespace-nowrap">{arriveText}</div>
        </div>

        <div className="items-start gap-1 text-[11px]">
          <div ref={badgeRowRef} className="flex flex-wrap items-center justify-center gap-1">
            {visibleRouteBadges.map((r) => (
              (() => {
                const isBestRoute = !!bestRouteId && String(r.routeId) === bestRouteId
                return (
                <button
                  key={String(r.routeId || r.routeName)}
                  type="button"
                  className={`max-w-full rounded-full px-2 py-0.5 text-[10px] leading-tight whitespace-nowrap ${isBestRoute ? 'ring-2 ring-indigo-300' : ''}`}
                  style={isBestRoute
                    ? { ...getRouteNameStyle(r.routeTypeCd), background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8' }
                    : getRouteNameStyle(r.routeTypeCd)}
                  title={r.routeName}
                >
                  {r.routeName}
                </button>
                )
              })()
            ))}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1 text-[10px]">
            <span className="text-slate-500">추천은 과거 이력 기준 · 실시간은 시간이력 매핑 기준</span>
          </div>
          <div className="mt-1 flex items-center justify-center gap-1">
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] hover:bg-slate-50"
              onClick={(ev) => {
                ev.stopPropagation()
                setArrivalPanelStationType('board')
                setArrivalPanelOpen(true)
              }}
            >
              탑승정류장 실시간
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] hover:bg-slate-50"
              onClick={(ev) => {
                ev.stopPropagation()
                setArrivalPanelStationType('alight')
                setArrivalPanelOpen(true)
              }}
            >
              하차정류장 실시간
            </button>
          </div>
        </div>

        <RealtimeArrivalPanel
          group={group}
          stationType={arrivalPanelStationType}
          open={arrivalPanelOpen}
          onClose={() => setArrivalPanelOpen(false)}
        />
      </div>

      {/* Expanded section */}
      {isExpanded && (
        <>
          {!sday && (
            <div className="mt-2 text-slate-500 text-sm">날짜를 선택하세요.</div>
          )}

          {timetableState && !timetableHidden && (
            <GroupTimetable
              group={group}
              groupKey={String(group.board.stationId) + '-' + String(group.alight.stationId)}
              state={timetableState}
              sday={sday}
              combined={combined}
              highlightedRowIndex={highlightedRowIndex}
              tableScrollRef={tableScrollRef}
              onSelectRoute={onSelectRoute}
              onMoveToCurrentTime={onMoveToCurrentTime}
              onFold={onFoldTimetable}
            />
          )}
        </>
      )}
    </div>
  )
}
