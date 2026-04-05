import React from 'react'
import { Group, GroupTimetableState, RouteBadgeInfo, TimetableEntry } from '../types'
import { getGroupRouteBadges } from '../utils/routeUtils'
import { formatDisplayTime, formatDuration } from '../utils/timeUtils'
import { getRouteNameStyle } from '../utils/styleUtils'

interface GroupTimetableProps {
  group: Group
  groupKey: string
  state: GroupTimetableState
  sday: string
  combined: TimetableEntry[]
  highlightedRowIndex: number
  tableScrollRef: (el: HTMLDivElement | null) => void
  onSelectRoute: (routeId: string | null) => void
  onMoveToCurrentTime: () => void
  onFold: () => void
}

export default function GroupTimetable({
  group,
  groupKey,
  state,
  sday,
  combined,
  highlightedRowIndex,
  tableScrollRef,
  onSelectRoute,
  onMoveToCurrentTime,
  onFold,
}: GroupTimetableProps) {
  if (state.loading) {
    return (
      <div className="mt-2.5 rounded border border-amber-200 bg-amber-50 p-2.5">
        <div>시간이력 조회 중...</div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="mt-2.5 rounded border border-amber-200 bg-amber-50 p-2.5">
        <div className="text-red-600">{state.error}</div>
      </div>
    )
  }

  const routeBadges: RouteBadgeInfo[] = getGroupRouteBadges(group)

  return (
    <div className="mt-2.5 rounded border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2.5">
      {/* Sticky header */}
      <div className="sticky top-[69px] z-[3] bg-gradient-to-b from-slate-50 to-white pb-1">
        <div className="flex items-center gap-2 justify-between">
          <div>
            <strong>운행 횟수:</strong> {combined.length}회
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
              onClick={onMoveToCurrentTime}
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
        <div className="mt-2 flex items-center gap-2 overflow-x-auto px-0.5 py-1.5">
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation()
              onSelectRoute(null)
            }}
            className="shrink-0 rounded-full border border-slate-200 px-2 py-1 text-xs font-bold whitespace-nowrap"
            style={{
              background: state.selectedRouteId ? '#fff' : '#2563eb',
              color: state.selectedRouteId ? '#374151' : '#fff',
            }}
          >
            All
          </button>
          {routeBadges.map((r) => {
            const isSelected = state.selectedRouteId && String(state.selectedRouteId) === String(r.routeId)
            return (
              <button
                key={r.routeId}
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation()
                  onSelectRoute(r.routeId)
                }}
                className="shrink-0 rounded-full border border-slate-200 px-2 py-1 text-xs font-bold whitespace-nowrap"
                style={{
                  background: isSelected ? '#2563eb' : '#fff',
                  color: isSelected ? '#fff' : '#374151',
                }}
              >
                {r.routeName}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      {combined.length > 0 && (
        <div ref={tableScrollRef} className="mt-1.5">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['노선 번호', '탑승', '하차', '소요 시간'].map((h) => (
                  <th
                    key={h}
                    className="sticky top-[160px] z-[2] border-b border-indigo-300 bg-indigo-100 px-1 py-1.5 text-left text-xs font-semibold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {combined.map((e, cIdx) => (
                <tr
                  data-row-index={cIdx}
                  key={String(e.vehId || '') + '-' + cIdx}
                  className={highlightedRowIndex === cIdx ? 'bg-indigo-100' : undefined}
                >
                  <td className="border-b border-gray-300 px-1 py-1.5 text-xs whitespace-nowrap">
                    <span style={getRouteNameStyle(e.routeTypeCd)}>
                      {e.routeName || e.routeId || '-'}
                    </span>
                  </td>
                  <td className="border-b border-gray-300 px-1 py-1.5 text-xs whitespace-nowrap">
                    {formatDisplayTime(e.boardTime, sday)}
                  </td>
                  <td className="border-b border-gray-300 px-1 py-1.5 text-xs whitespace-nowrap">
                    <span>{formatDisplayTime(e.alightTime, sday)}</span>
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
                  <td className="border-b border-gray-300 px-1 py-1.5 text-xs">
                    {formatDuration(e.boardTime, e.alightTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
