import React from 'react'
import { Group, GroupTimetableState, RouteBadgeInfo, TimetableEntry } from '../types'
import { getRouteNameStyle } from '../utils/styleUtils'
import { formatDisplayTime, formatSecondsToMinuteText } from '../utils/timeUtils'
import GroupTimetable from './GroupTimetable'

interface GroupCardProps {
  groupKey: string
  group: Group
  index: number
  isExpanded: boolean
  startLabel: string
  endLabel: string
  prefetchingBusDuration: boolean
  prefetchedBusDurationText: string | null
  sday: string
  timetableState: GroupTimetableState | undefined
  timetableHidden: boolean
  combined: TimetableEntry[]
  prefetchedCombined: TimetableEntry[]
  highlightedRowIndex: number
  visibleRouteBadges: RouteBadgeInfo[]
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
  startLabel,
  endLabel,
  prefetchingBusDuration,
  prefetchedBusDurationText,
  sday,
  timetableState,
  timetableHidden,
  combined,
  prefetchedCombined,
  highlightedRowIndex,
  visibleRouteBadges,
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
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
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
  const bestTimeline = (selectableCandidates.length ? selectableCandidates : timelineCandidates)
    .sort((a, b) => (a.alightMin - b.alightMin) || (a.boardMin - b.boardMin))[0]

  const bestRouteId = bestTimeline?.entry?.routeId ? String(bestTimeline.entry.routeId) : null
  const bestBusMin = bestTimeline ? Math.max(0, bestTimeline.alightMin - bestTimeline.boardMin) : null
  const departText = bestTimeline ? formatMinuteText(bestTimeline.boardMin - walkStartMin) : '-'
  const boardText = bestTimeline ? bestTimeline.boardText : '-'
  const alightText = bestTimeline ? bestTimeline.alightText : '-'
  const arriveText = bestTimeline ? formatMinuteText(bestTimeline.alightMin + walkEndMin) : '-'
  const totalMinText = bestBusMin == null ? '-' : `${bestBusMin + walkStartMin + walkEndMin}분`

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
      <div className="mb-2 flex w-full items-center justify-between">
        <span className="rounded-[10px] bg-gray-900 px-2 py-0.5 text-xs font-bold text-white">
          결과 {index + 1}
        </span>

        <div className="mt-0.5 text-[11px] text-slate-700 text-center font-semibold">
          예상 총 소요 {totalMinText}
        </div>
        <button
          type="button"
          title={timetableState && !timetableHidden ? '시간표 닫기' : '통합 시간이력'}
          aria-label={timetableState && !timetableHidden ? '시간표 닫기' : '통합 시간이력'}
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
      <div className="mt-1 rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2.5">
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
              bestBusMin != null ? `${bestBusMin}분` : busDurationText
            )}
          </div>
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-600 text-white">{WalkIcon}</span>
          <div className="h-2.5 rounded-r bg-slate-300 flex items-center justify-center">{formatSecondsToMinuteText(group.walk?.alightToEnd?.timeSec)}</div>
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-600 text-white"></span>
        </div>

        <div className="mt-1 grid grid-cols-[auto_minmax(0,0.7fr)_auto_minmax(0,2.2fr)_auto_minmax(0,0.7fr)_auto] items-start gap-1 text-[11px]">
          <div />
          <div />
          <div className="relative h-4">
            <div className="absolute left-1/2 top-0 w-max max-w-[140px] -translate-x-1/2 truncate text-center text-slate-700" title={group.board.stationName}>
              {group.board.stationName}
            </div>
          </div>
          <div />
          <div className="relative h-4">
            <div className="absolute left-1/2 top-0 w-max max-w-[140px] -translate-x-1/2 truncate text-center text-slate-700" title={group.alight.stationName}>
              {group.alight.stationName}
            </div>
          </div>
          <div />
          <div />
        </div>
        <div className="grid grid-cols-[auto_minmax(0,0.7fr)_auto_minmax(0,2.2fr)_auto_minmax(0,0.7fr)_auto] items-start text-[11px] text-slate-700">
          <div className="text-center">{departText}</div>
          <div />
          <div className="text-center">{boardText}</div>
          <div />
          <div className="text-center">{alightText}</div>
          <div />
          <div className="text-center whitespace-nowrap">{arriveText}</div>
        </div>

        <div className="mt-2 items-start gap-1 text-[11px]">
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
        </div>
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
