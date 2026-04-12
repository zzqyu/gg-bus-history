import React from 'react'
import {
  SearchResult,
  Group,
  GroupTimetableState,
  AllGroupsTimetableState,
  TimetableEntry,
  StationNumberMaps,
} from '../types'
import { getGroupKey, getGroupRouteBadges } from '../utils/routeUtils'
import { formatDisplayTime, getServiceDayNowMinutes } from '../utils/timeUtils'
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
  allGroupsSelectedRouteIds: string[]
  expandedGroupKey: string | null
  allGroupsTableScrollRef: React.RefObject<HTMLDivElement>
  groupTableScrollRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  routeBadgeRowRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  stationNumberMaps: StationNumberMaps
  onShare: () => void
  onFetchAllGroupsTimetable: () => void
  onSelectAllGroupsRoutes: (routeIds: string[]) => void
  onMoveAllGroupsToCurrentTime: () => void
  onFoldAllGroupsTimetable: () => void
  onShowGroupList: () => void
  onGroupCardClick: (e: React.MouseEvent, groupKey: string) => void
  onToggleGroupTimetable: (groupKey: string, g: Group) => void
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
  allGroupsSelectedRouteIds,
  expandedGroupKey,
  allGroupsTableScrollRef,
  groupTableScrollRefs,
  routeBadgeRowRefs,
  stationNumberMaps,
  onShare,
  onFetchAllGroupsTimetable,
  onSelectAllGroupsRoutes,
  onMoveAllGroupsToCurrentTime,
  onFoldAllGroupsTimetable,
  onShowGroupList,
  onGroupCardClick,
  onToggleGroupTimetable,
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
  const allCombinedEntries = allGroupsTimetable?.data?.combined || []
  const isPrefetchingBusDuration = !!allGroupsTimetable?.loading && allCombinedEntries.length === 0

  function getPrefetchedBusDurationText(g: Group): string | null {
    if (!allCombinedEntries.length) return null

    const routeIdSet = new Set((g.routes || []).map((r) => String(r.routeId)))
    const boardName = String(g.board.stationName || '').trim()
    const alightName = String(g.alight.stationName || '').trim()

    const minutes = allCombinedEntries
      .filter((entry) => {
        const routeOk = routeIdSet.has(String(entry.routeId || ''))
        const boardOk = String(entry.boardStationName || '').trim() === boardName
        const alightOk = String(entry.alightStationName || '').trim() === alightName
        return routeOk && boardOk && alightOk
      })
      .map((entry) => {
        if (!entry.boardTime || !entry.alightTime) return Number.NaN
        const board = new Date(String(entry.boardTime).replace(' ', 'T'))
        const alight = new Date(String(entry.alightTime).replace(' ', 'T'))
        if (Number.isNaN(board.getTime()) || Number.isNaN(alight.getTime())) return Number.NaN
        const diffMin = Math.floor((alight.getTime() - board.getTime()) / 60000)
        return diffMin >= 0 ? diffMin : Number.NaN
      })
      .filter((v) => Number.isFinite(v)) as number[]

    if (!minutes.length) return null
    const min = Math.min(...minutes)
    const max = Math.max(...minutes)
    return min === max ? `${min}분` : `${min}~${max}분`
  }

  function getPrefetchedCombinedEntries(g: Group): TimetableEntry[] {
    if (!allCombinedEntries.length) return []
    const routeIdSet = new Set((g.routes || []).map((r) => String(r.routeId)))
    const boardName = String(g.board.stationName || '').trim()
    const alightName = String(g.alight.stationName || '').trim()
    const walkToBoardSec = Number(g.walk?.startToBoard?.timeSec || 0)
    const walkFromAlightSec = Number(g.walk?.alightToEnd?.timeSec || 0)
    const walkTotalSec = Number(g.walk?.totalTimeSec || (walkToBoardSec + walkFromAlightSec))

    return allCombinedEntries
      .filter((entry) => {
        const routeOk = routeIdSet.has(String(entry.routeId || ''))
        const boardOk = String(entry.boardStationName || '').trim() === boardName
        const alightOk = String(entry.alightStationName || '').trim() === alightName
        return routeOk && boardOk && alightOk
      })
      .map((entry) => ({
        ...entry,
        walkToBoardSec,
        walkFromAlightSec,
        walkTotalSec,
      }))
  }

  function parseDisplayMinutes(text: string): number | null {
    const m = String(text).match(/^(\d+):(\d{2})$/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }

  function getBestArrivalScoreMinutes(g: Group): number {
    const groupKey = getGroupKey(g)
    const combined = getCombinedForGroup(groupKey)
    const sourceEntries = combined.length > 0 ? combined : getPrefetchedCombinedEntries(g)
    if (!sourceEntries.length) return Number.POSITIVE_INFINITY

    const walkStartMin = Math.max(0, Math.round(Number(g.walk?.startToBoard?.timeSec || 0) / 60))
    const walkEndMin = Math.max(0, Math.round(Number(g.walk?.alightToEnd?.timeSec || 0) / 60))
    const now = new Date()
    const earliestBoard = getServiceDayNowMinutes(now) + walkStartMin

    const candidates = sourceEntries
      .map((entry) => {
        const boardText = formatDisplayTime(entry.boardTime, sday)
        const alightText = formatDisplayTime(entry.alightTime, sday)
        const boardMin = parseDisplayMinutes(boardText)
        const alightMin = parseDisplayMinutes(alightText)
        if (boardMin == null || alightMin == null || alightMin < boardMin) return null
        return { boardMin, arrivalMin: alightMin + walkEndMin }
      })
      .filter((v): v is NonNullable<typeof v> => !!v)

    if (!candidates.length) return Number.POSITIVE_INFINITY
    const normalized = candidates.map((x) => {
      let board = x.boardMin
      let arrival = x.arrivalMin
      while (board < earliestBoard) {
        board += 1440
        arrival += 1440
      }
      return { boardMin: board, arrivalMin: arrival }
    })
    return Math.min(...normalized.map((x) => x.arrivalMin))
  }

  const sortedGroups = groups
    .map((g, originalIdx) => ({
      g,
      originalIdx,
      score: getBestArrivalScoreMinutes(g),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      return a.originalIdx - b.originalIdx
    })
    .map((item, sortedIdx) => ({
      ...item,
      sortedIdx,
    }))

  const focusedCardOnly = !showAllGroupsTimetable && !showGroupList && !!expandedGroupKey
  const visibleGroups = focusedCardOnly
    ? sortedGroups.filter(({ g }) => getGroupKey(g) === expandedGroupKey)
    : sortedGroups

  return (
    <div className="mt-5">
      {/* Header */}
      {!focusedCardOnly && (
        <>
          <div className="mb-1 flex items-center justify-between gap-2">
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
          <div className="mb-3">
            <h5 className="m-0 text-sm text-slate-500">{"* 하차 기록이 없는 경우 통계적으로 산출된 예상값입니다."}</h5>
            <h5 className="m-0 text-sm text-slate-500">{"* 현재·미래 운행 일정, 임시편성은 반영되지 않을 수 있습니다."}</h5>
            <h5 className="m-0 text-sm text-slate-500">{"* 실제 승차 전, 버스정보시스템(경기버스정보 등)에서 실시간 확인을 권장합니다."}</h5>
            <h5 className="m-0 text-sm text-red-500">
              <span>
                {"* 도보 시간은 직선거리 기준 추정치이며, 상세 도보 경로는 직선거리 옆 카드 버튼"}
                <span
                  aria-hidden="true"
                  className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  title="외부링크 버튼 예시"
                >
                  <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none">
                    <path d="M14 5h5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M10 14 19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M19 14v5h-14v-14h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {"을 눌러 확인하세요."}
              </span>
            </h5>
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
        </>
      )}

      {/* All groups timetable */}
      {allGroupsTimetable && showAllGroupsTimetable && (
        <AllGroupsTimetable
          state={allGroupsTimetable}
          sday={sday}
          stationNumberMaps={stationNumberMaps}
          highlightedRowIndex={allGroupsHighlightedRowIndex}
          selectedRouteIds={allGroupsSelectedRouteIds}
          tableScrollRef={allGroupsTableScrollRef}
          onSelectRoutes={onSelectAllGroupsRoutes}
          onMoveToCurrentTime={onMoveAllGroupsToCurrentTime}
          onFold={onFoldAllGroupsTimetable}
        />
      )}

      {/* Show group list button when timetable is open */}
      {allGroupsTimetable && showAllGroupsTimetable && !showGroupList && (
        <div className="fixed bottom-3 left-0 right-0 z-40 flex justify-center">
          <button
            type="button"
            onClick={onShowGroupList}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50"
          >
            결과목록보기
          </button>
        </div>
      )}

      {/* Show group list button when focused single card mode */}
      {focusedCardOnly && (
        <div className="fixed bottom-3 left-0 right-0 z-40 flex justify-center">
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
        visibleGroups.map(({ g, sortedIdx }) => {
          const groupKey = getGroupKey(g)
          const isExpanded = expandedGroupKey === groupKey
          const timetableState = groupTimetables[groupKey]
          const combined = getCombinedForGroup(groupKey)
          const badges = getGroupRouteBadges(g)

          return (
            <GroupCard
              key={groupKey + '-' + sortedIdx}
              groupKey={groupKey}
              group={g}
              index={sortedIdx}
              isExpanded={isExpanded}
              sday={sday}
              timetableState={timetableState}
              timetableHidden={!!groupTimetableHidden[groupKey]}
              combined={combined}
              prefetchedCombined={getPrefetchedCombinedEntries(g)}
              highlightedRowIndex={groupHighlightedRowIndexes[groupKey] ?? -1}
              visibleRouteBadges={badges}
              prefetchingBusDuration={isPrefetchingBusDuration}
              prefetchedBusDurationText={getPrefetchedBusDurationText(g)}
              stationNumberMaps={stationNumberMaps}
              tableScrollRef={(el) => {
                groupTableScrollRefs.current[groupKey] = el
              }}
              badgeRowRef={(el) => {
                routeBadgeRowRefs.current[groupKey] = el
              }}
              onCardClick={(e) => onGroupCardClick(e, groupKey)}
              onToggleTimetable={() => onToggleGroupTimetable(groupKey, g)}
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
