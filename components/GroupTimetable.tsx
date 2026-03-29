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
    <div className="mt-2.5 rounded border border-amber-200 bg-amber-50 p-2.5">
      {/* Sticky header */}
      <div className="sticky top-[69px] z-[3] bg-amber-50 pb-1">
        <div className="flex items-center gap-2">
          <div>
            <strong>통합 시간이력:</strong> {combined.length}회
          </div>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
            onClick={onMoveToCurrentTime}
          >
            현재시간
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
            onClick={onFold}
          >
            테이블 접기
          </button>
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
                {['노선번호', '탑승시간', '하차시간', '소요시간'].map((h) => (
                  <th
                    key={h}
                    className="sticky top-[160px] z-[2] border-b border-amber-400 bg-amber-100 px-1 py-1.5 text-left text-xs font-semibold"
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
                  className={highlightedRowIndex === cIdx ? 'bg-amber-100' : undefined}
                >
                  <td className="border-b border-amber-300 px-1 py-1.5 text-xs whitespace-nowrap">
                    <span style={getRouteNameStyle(e.routeTypeCd)}>
                      {e.routeName || e.routeId || '-'}
                    </span>
                  </td>
                  <td className="border-b border-amber-300 px-1 py-1.5 text-xs whitespace-nowrap">
                    {formatDisplayTime(e.boardTime, sday)}
                  </td>
                  <td className="border-b border-amber-300 px-1 py-1.5 text-xs whitespace-nowrap">
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
                  <td className="border-b border-amber-300 px-1 py-1.5 text-xs">
                    {formatDuration(e.boardTime, e.alightTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-route summary */}
      <div className="flex gap-1 mt-4">
        {(state.data?.timetables || []).map((tt, tIdx) => (
          <div key={String(tt.routeId) + '-' + tIdx} className="mt-1.5 text-sm">
            <span style={getRouteNameStyle(tt.routeTypeCd)}>{tt.routeName}</span> :{' '}
            {(tt.entries || []).length}회
          </div>
        ))}
      </div>
    </div>
  )
}
