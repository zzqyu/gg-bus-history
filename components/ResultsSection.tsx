import React from 'react'
import {
  SearchResult,
  Group,
  GroupTimetableState,
  AllGroupsTimetableState,
  TimetableEntry,
} from '../types'
import { getGroupKey, getGroupRouteBadges } from '../utils/routeUtils'
import AllGroupsTimetable from './AllGroupsTimetable'
import GroupCard from './GroupCard'

interface ResultsSectionProps {
  result: SearchResult
  sday: string
  groupTimetables: Record<string, GroupTimetableState>
  allGroupsTimetable: AllGroupsTimetableState | null
  showAllGroupsTimetable: boolean
  showGroupList: boolean
  groupTimetableHidden: Record<string, boolean>
  allGroupsHighlightedRowIndex: number
  groupHighlightedRowIndexes: Record<string, number>
  allGroupsSelectedRouteId: string | null
  expandedGroupKey: string | null
  allGroupsTableScrollRef: React.RefObject<HTMLDivElement>
  groupTableScrollRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  routeBadgeRowRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  onShare: () => void
  onFetchAllGroupsTimetable: () => void
  onSelectAllGroupsRoute: (routeId: string | null) => void
  onMoveAllGroupsToCurrentTime: () => void
  onFoldAllGroupsTimetable: () => void
  onShowGroupList: () => void
  onGroupCardClick: (e: React.MouseEvent, groupKey: string) => void
  onFetchGroupTimetable: (g: Group, routeId?: string) => void
  onSelectGroupRoute: (groupKey: string, g: Group, routeId: string | null) => void
  onMoveGroupToCurrentTime: (groupKey: string) => void
  onFoldGroupTimetable: (groupKey: string) => void
  getCombinedForGroup: (groupKey: string) => TimetableEntry[]
}

export default function ResultsSection({
  result,
  sday,
  groupTimetables,
  allGroupsTimetable,
  showAllGroupsTimetable,
  showGroupList,
  groupTimetableHidden,
  allGroupsHighlightedRowIndex,
  groupHighlightedRowIndexes,
  allGroupsSelectedRouteId,
  expandedGroupKey,
  allGroupsTableScrollRef,
  groupTableScrollRefs,
  routeBadgeRowRefs,
  onShare,
  onFetchAllGroupsTimetable,
  onSelectAllGroupsRoute,
  onMoveAllGroupsToCurrentTime,
  onFoldAllGroupsTimetable,
  onShowGroupList,
  onGroupCardClick,
  onFetchGroupTimetable,
  onSelectGroupRoute,
  onMoveGroupToCurrentTime,
  onFoldGroupTimetable,
  getCombinedForGroup,
}: ResultsSectionProps) {
  if (result.loading) {
    return <div className="mt-5">검색 중...</div>
  }

  if (result.error) {
    return <div className="mt-5 text-red-600">{result.error}</div>
  }

  const groups = result.groups || []

  return (
    <div className="mt-5">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="m-0 text-base font-bold">검색 결과: {groups.length}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onShare}
            title="검색 결과 공유"
            aria-label="검색 결과 공유"
            className="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12l7-7 7 7" />
              <rect x="5" y="19" width="14" height="2" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* All groups timetable button */}
      <div className="mb-3">
        <button
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onFetchAllGroupsTimetable}
          disabled={!sday}
        >
          모든 결과 통합 시간이력
        </button>
        {!sday && (
          <span className="ml-2 text-slate-500">날짜를 선택하세요.</span>
        )}
      </div>

      {/* All groups timetable */}
      {allGroupsTimetable && showAllGroupsTimetable && (
        <AllGroupsTimetable
          state={allGroupsTimetable}
          sday={sday}
          highlightedRowIndex={allGroupsHighlightedRowIndex}
          selectedRouteId={allGroupsSelectedRouteId}
          tableScrollRef={allGroupsTableScrollRef}
          onSelectRoute={onSelectAllGroupsRoute}
          onMoveToCurrentTime={onMoveAllGroupsToCurrentTime}
          onFold={onFoldAllGroupsTimetable}
        />
      )}

      {/* Show group list button when timetable is open */}
      {allGroupsTimetable && showAllGroupsTimetable && !showGroupList && (
        <div className="sticky bottom-3 z-20 mb-3 flex justify-center">
          <button
            type="button"
            onClick={onShowGroupList}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50"
          >
            결과목록보기
          </button>
        </div>
      )}

      {/* Group cards */}
      {showAllGroupsTimetable && !showGroupList ? null : groups.length === 0 ? (
        <div>조회에 맞는 경로가 없습니다.</div>
      ) : (
        groups.map((g, idx) => {
          const groupKey = getGroupKey(g)
          const isExpanded = expandedGroupKey === groupKey
          const timetableState = groupTimetables[groupKey]
          const combined = getCombinedForGroup(groupKey)
          const badges = getGroupRouteBadges(g)

          return (
            <GroupCard
              key={groupKey + '-' + idx}
              group={g}
              index={idx}
              isExpanded={isExpanded}
              sday={sday}
              timetableState={timetableState}
              timetableHidden={!!groupTimetableHidden[groupKey]}
              combined={combined}
              highlightedRowIndex={groupHighlightedRowIndexes[groupKey] ?? -1}
              visibleRouteBadges={badges}
              tableScrollRef={(el) => {
                groupTableScrollRefs.current[groupKey] = el
              }}
              badgeRowRef={(el) => {
                routeBadgeRowRefs.current[groupKey] = el
              }}
              onCardClick={(e) => onGroupCardClick(e, groupKey)}
              onFetchTimetable={() => onFetchGroupTimetable(g)}
              onRouteBadgeClick={(routeId) => onFetchGroupTimetable(g, routeId)}
              onSelectRoute={(routeId) => onSelectGroupRoute(groupKey, g, routeId)}
              onMoveToCurrentTime={() => onMoveGroupToCurrentTime(groupKey)}
              onFoldTimetable={() => onFoldGroupTimetable(groupKey)}
            />
          )
        })
      )}
    </div>
  )
}
