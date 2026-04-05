import React from 'react'
import { Group, GroupTimetableState, RouteBadgeInfo, TimetableEntry } from '../types'
import { getRouteNameStyle } from '../utils/styleUtils'
import { formatSecondsToMinuteText } from '../utils/timeUtils'
import GroupTimetable from './GroupTimetable'

interface GroupCardProps {
  group: Group
  index: number
  isExpanded: boolean
  sday: string
  timetableState: GroupTimetableState | undefined
  timetableHidden: boolean
  combined: TimetableEntry[]
  highlightedRowIndex: number
  visibleRouteBadges: RouteBadgeInfo[]
  tableScrollRef: (el: HTMLDivElement | null) => void
  badgeRowRef: (el: HTMLDivElement | null) => void
  onCardClick: (e: React.MouseEvent) => void
  onFetchTimetable: () => void
  onRouteBadgeClick: (routeId: string) => void
  onSelectRoute: (routeId: string | null) => void
  onMoveToCurrentTime: () => void
  onFoldTimetable: () => void
}

export default function GroupCard({
  group,
  index,
  isExpanded,
  sday,
  timetableState,
  timetableHidden,
  combined,
  highlightedRowIndex,
  visibleRouteBadges,
  tableScrollRef,
  badgeRowRef,
  onCardClick,
  onFetchTimetable,
  onRouteBadgeClick,
  onSelectRoute,
  onMoveToCurrentTime,
  onFoldTimetable,
}: GroupCardProps) {
  return (
    <div
      onClick={onCardClick}
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
        <span className="text-[13px] text-slate-600">{isExpanded ? '접기' : '펼치기'}</span>
      </div>

      {/* Station info */}
      <div className="text-sm">
        <strong>탑승:</strong> {group.board.stationName} ({Math.round(group.board.dist)}m)
      </div>
      <div className="text-sm">
        <strong>하차:</strong> {group.alight.stationName} ({Math.round(group.alight.dist)}m)
      </div>
      <div className="mt-0.5 text-sm text-slate-700">
        <strong>도보:</strong>{' '}
        출발→탑승 {formatSecondsToMinuteText(group.walk?.startToBoard?.timeSec)} / 하차→도착 {formatSecondsToMinuteText(group.walk?.alightToEnd?.timeSec)}
        {' '}(총 {formatSecondsToMinuteText(group.walk?.totalTimeSec)})
      </div>

      {/* Route badges */}
      <div className="mt-1.5">
        <div
          ref={badgeRowRef}
          className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap"
        >
          {visibleRouteBadges.map((r) => (
            <button
              key={String(r.routeId || r.routeName)}
              type="button"
              onClick={(ev) => {
                ev.stopPropagation()
                try {
                  onRouteBadgeClick(r.routeId)
                } catch {
                  // ignore
                }
              }}
              className="shrink-0 cursor-pointer rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs whitespace-nowrap"
              style={getRouteNameStyle(r.routeTypeCd)}
            >
              {r.routeName}
            </button>
          ))}
        </div>
      </div>

      {/* Expanded section */}
      {isExpanded && (
        <>
          <div className="mt-2">
            <button
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onFetchTimetable}
              disabled={!sday}
            >
              통합 시간이력
            </button>
            {!sday && (
              <span className="ml-2 text-slate-500">날짜를 선택하세요.</span>
            )}
          </div>

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
