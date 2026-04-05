import React from 'react'
import { AllGroupsTimetableState, TimetableEntry } from '../types'
import { compareRoutes } from '../utils/routeUtils'
import { formatDisplayTime, formatDuration, formatSecondsToMinuteText } from '../utils/timeUtils'
import { getRouteNameStyle } from '../utils/styleUtils'

interface AllGroupsTimetableProps {
  state: AllGroupsTimetableState
  sday: string
  highlightedRowIndex: number
  selectedRouteIds: string[]
  tableScrollRef: React.RefObject<HTMLDivElement>
  onSelectRoutes: (routeIds: string[]) => void
  onMoveToCurrentTime: () => void
  onFold: () => void
}

export default function AllGroupsTimetable({
  state,
  sday,
  highlightedRowIndex,
  selectedRouteIds,
  tableScrollRef,
  onSelectRoutes,
  onMoveToCurrentTime,
  onFold,
}: AllGroupsTimetableProps) {
  const [recentlyMovedToNow, setRecentlyMovedToNow] = React.useState(false)

  if (state.loading) {
    return (
      <div className="mb-3.5 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
        <div>전체 결과 시간이력 조회 중...</div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="mb-3.5 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
        <div className="text-red-600">{state.error}</div>
      </div>
    )
  }

  const combined: TimetableEntry[] = (state.data && state.data.combined) || []
  const selectedRouteSet = new Set((selectedRouteIds || []).map((x) => String(x)))
  const filtered = selectedRouteSet.size > 0
    ? combined.filter((x) => selectedRouteSet.has(String(x.routeId || '')))
    : combined

  const routeMap = new Map<string, TimetableEntry>()
  for (const e of combined) {
    const rid = String(e.routeId || '')
    if (!rid || routeMap.has(rid)) continue
    routeMap.set(rid, e)
  }
  const routeArr = Array.from(routeMap.values())
  routeArr.sort(compareRoutes)
  const displayedRouteArr = [...routeArr].sort((a, b) => {
    const aSelected = selectedRouteSet.has(String(a.routeId || ''))
    const bSelected = selectedRouteSet.has(String(b.routeId || ''))
    if (aSelected === bSelected) return 0
    return aSelected ? -1 : 1
  })

  const boardStationIndexMap = new Map<string, number>()
  const alightStationIndexMap = new Map<string, number>()
  const boardWalkByStation = new Map<string, number[]>()
  const alightWalkByStation = new Map<string, number[]>()

  function registerBoardStation(name: string): number {
    const key = String(name || '').trim()
    if (!key || key === '-') return 0
    const existing = boardStationIndexMap.get(key)
    if (existing) return existing
    const next = boardStationIndexMap.size + 1
    boardStationIndexMap.set(key, next)
    return next
  }

  function registerAlightStation(name: string): number {
    const key = String(name || '').trim()
    if (!key || key === '-') return 0
    const existing = alightStationIndexMap.get(key)
    if (existing) return existing
    const next = alightStationIndexMap.size + 1
    alightStationIndexMap.set(key, next)
    return next
  }

  function pushFiniteWalk(map: Map<string, number[]>, stationName: string, sec: unknown) {
    const key = String(stationName || '').trim()
    const value = Number(sec)
    if (!key || key === '-' || !Number.isFinite(value)) return
    const arr = map.get(key) || []
    arr.push(Math.max(0, value))
    map.set(key, arr)
  }

  for (const entry of filtered) {
    const board = String(entry.boardStationName || '').trim()
    const alight = String(entry.alightStationName || '').trim()
    if (board) {
      registerBoardStation(board)
      pushFiniteWalk(boardWalkByStation, board, entry.walkToBoardSec)
    }
    if (alight) {
      registerAlightStation(alight)
      pushFiniteWalk(alightWalkByStation, alight, entry.walkFromAlightSec)
    }
  }

  const boardStationLegendArr = Array.from(boardStationIndexMap.entries())
    .map(([name, index]) => ({
      name,
      index,
      boardWalkSecList: boardWalkByStation.get(name) || [],
    }))
    .sort((a, b) => a.index - b.index)

  const alightStationLegendArr = Array.from(alightStationIndexMap.entries())
    .map(([name, index]) => ({
      name,
      index,
      alightWalkSecList: alightWalkByStation.get(name) || [],
    }))
    .sort((a, b) => a.index - b.index)

  function formatWalkLegendText(secList: number[]): string {
    if (!secList || secList.length === 0) return '-'
    const min = Math.min(...secList)
    const max = Math.max(...secList)
    if (min === max) return formatSecondsToMinuteText(min)
    return `${formatSecondsToMinuteText(min)}~${formatSecondsToMinuteText(max)}`
  }

  const handleMoveToCurrentTime = () => {
    setRecentlyMovedToNow(true)
    onMoveToCurrentTime()
  }

  React.useEffect(() => {
    if (!recentlyMovedToNow) return
    const timer = window.setTimeout(() => setRecentlyMovedToNow(false), 1600)
    return () => window.clearTimeout(timer)
  }, [recentlyMovedToNow])

  return (
    <div className="mb-3.5 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
      {/* Sticky header */}
      <div className="sticky top-[69px] z-[3] bg-blue-50 pb-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div>
              <strong>통합 시간이력</strong>
              <span className="ml-2 text-xs text-slate-700">
                전체 {combined.length}건 · 표시 {filtered.length}건
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
              onClick={handleMoveToCurrentTime}
            >
              현재시간
            </button>
            <button
              type="button"
              title="테이블 접기"
              aria-label="테이블 접기"
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50"
              onClick={onFold}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 15l6-6 6 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Route filter badges */}
        <div className="mt-1.5 flex items-center gap-2 overflow-x-auto px-0.5 py-1.5">
          <button
            type="button"
            onClick={() => onSelectRoutes([])}
            className="shrink-0 rounded-full border border-slate-200 px-2 py-1 text-xs font-bold whitespace-nowrap"
            style={{
              background: selectedRouteSet.size > 0 ? '#fff' : '#2563eb',
              color: selectedRouteSet.size > 0 ? '#374151' : '#fff',
            }}
          >
            전체
          </button>
          {displayedRouteArr.map((r) => {
            const rid = String(r.routeId || '')
            const isSelected = selectedRouteSet.has(rid)
            return (
              <button
                key={rid}
                type="button"
                onClick={() => {
                  const next = new Set(selectedRouteSet)
                  if (next.has(rid)) next.delete(rid)
                  else next.add(rid)
                  onSelectRoutes(Array.from(next))
                }}
                className="shrink-0 rounded-full border border-slate-200 px-2 py-1 text-xs font-bold whitespace-nowrap"
                style={{
                  background: isSelected ? '#2563eb' : '#fff',
                  color: isSelected ? '#fff' : '#374151',
                }}
              >
                {r.routeName || rid}
              </button>
            )
          })}
          {selectedRouteSet.size > 0 && (
            <button
              type="button"
              onClick={() => onSelectRoutes([])}
              className="shrink-0 rounded-full border border-blue-200 bg-white px-2 py-1 text-xs font-semibold whitespace-nowrap text-blue-700 hover:bg-blue-50"
            >
              필터 초기화
            </button>
          )}
        </div>

        {(boardStationLegendArr.length > 0 || alightStationLegendArr.length > 0) && (
          <div className="text-[11px] text-slate-700">
            <div className="rounded border border-slate-200 bg-slate-50 p-1.5">
                  <div className="mb-1 text-[10px] font-semibold text-slate-700">탑승 정류장</div>
                  <div className="flex flex-wrap gap-1">
                    {boardStationLegendArr
                      .map((item) => (
                        <span
                          key={`station-legend-board-${item.index}-${item.name}`}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5"
                          title={item.name}
                        >
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                            {item.index}
                          </span>
                          <span className="font-medium">{item.name}</span>
                          <span className="text-slate-500">(도보 {formatWalkLegendText(item.boardWalkSecList)})</span>
                        </span>
                      ))}
                  </div>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 p-1.5">
              <div className="mb-1 text-[10px] font-semibold text-slate-700">하차 정류장</div>
              <div className="flex flex-wrap gap-1">
                {alightStationLegendArr
                  .map((item) => (
                    <span
                      key={`station-legend-alight-${item.index}-${item.name}`}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5"
                      title={item.name}
                    >
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                        {item.index}
                      </span>
                      <span className="font-medium">{item.name}</span>
                      <span className="text-slate-500">(도보 {formatWalkLegendText(item.alightWalkSecList)})</span>
                    </span>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div ref={tableScrollRef} className="mt-1.5 max-h-[56vh] overflow-auto rounded border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead>
              <tr>
              {['노선 번호', '탑승', '하차', '소요 시간'].map((h) => (
                <th
                  key={h}
                  className="sticky top-0 z-[4] border-b border-indigo-300 bg-indigo-100 px-1 py-1.5 text-left text-xs font-semibold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, idx) => (
              <tr
                data-row-index={idx}
                key={String(e.routeId || '') + '-' + String(e.vehId || '') + '-' + idx}
                className={highlightedRowIndex === idx ? (recentlyMovedToNow ? 'bg-indigo-100 animate-pulse' : 'bg-indigo-50') : undefined}
              >
                <td className="border-b border-slate-300 px-1 py-1.5 text-xs whitespace-nowrap">
                  <span style={getRouteNameStyle(e.routeTypeCd)}>{e.routeName || e.routeId}</span>
                </td>
                <td className="border-b border-slate-300 px-1 py-1.5 text-xs whitespace-nowrap">
                  {(() => {
                    const boardName = String(e.boardStationName || '').trim()
                    const boardNo = boardName ? boardStationIndexMap.get(boardName) : null
                    return (
                      <span className="inline-flex items-center gap-1" title={boardName || '-'}>
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                          {boardNo || '-'}
                        </span>
                        <span>{formatDisplayTime(e.boardTime, sday)}</span>
                      </span>
                    )
                  })()}
                </td>
                <td className="border-b border-slate-300 px-1 py-1.5 text-xs whitespace-nowrap">
                  {(() => {
                    const alightName = String(e.alightStationName || '').trim()
                    const alightNo = alightName ? alightStationIndexMap.get(alightName) : null
                    return (
                      <span className="inline-flex items-center gap-1" title={alightName || '-'}>
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                          {alightNo || '-'}
                        </span>
                        <span>{formatDisplayTime(e.alightTime, sday)}</span>
                      </span>
                    )
                  })()}
                  {e.inferred && (
                    <span
                      title={`추정 시간 (${e.inference_method ?? ''}${e.inference_confidence ? ' · ' + e.inference_confidence : ''})`}
                      className="ml-1 rounded px-0.5 text-[10px] font-semibold leading-tight"
                      style={{ background: '#fef9c3', color: '#92400e', border: '1px solid #fcd34d' }}
                    >
                      추정
                    </span>
                  )}
                </td>
                <td className="border-b border-slate-300 px-1 py-1.5 text-xs">
                  {formatDuration(e.boardTime, e.alightTime)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
