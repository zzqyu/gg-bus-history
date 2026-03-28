import React from 'react'
import { AllGroupsTimetableState, TimetableEntry } from '../types'
import { compareRoutes } from '../utils/routeUtils'
import { formatDisplayTime, formatDuration } from '../utils/timeUtils'
import { getRouteNameStyle } from '../utils/styleUtils'

interface AllGroupsTimetableProps {
  state: AllGroupsTimetableState
  sday: string
  highlightedRowIndex: number
  selectedRouteId: string | null
  tableScrollRef: React.RefObject<HTMLDivElement>
  onSelectRoute: (routeId: string | null) => void
  onMoveToCurrentTime: () => void
  onFold: () => void
}

export default function AllGroupsTimetable({
  state,
  sday,
  highlightedRowIndex,
  selectedRouteId,
  tableScrollRef,
  onSelectRoute,
  onMoveToCurrentTime,
  onFold,
}: AllGroupsTimetableProps) {
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
  const filtered = selectedRouteId
    ? combined.filter((x) => String(x.routeId) === String(selectedRouteId))
    : combined

  const routeMap = new Map<string, TimetableEntry>()
  for (const e of combined) {
    const rid = String(e.routeId || '')
    if (!rid || routeMap.has(rid)) continue
    routeMap.set(rid, e)
  }
  const routeArr = Array.from(routeMap.values())
  routeArr.sort(compareRoutes)

  return (
    <div className="mb-3.5 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
      {/* Sticky header */}
      <div className="sticky top-0 z-[3] bg-blue-50 py-1">
        <div className="flex items-center gap-2">
          <div>
            <strong>전체 결과 통합 시간이력:</strong> {combined.length}회
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
            onClick={() => onSelectRoute(null)}
            className="shrink-0 rounded-full border border-slate-200 px-2 py-1 text-xs font-bold whitespace-nowrap"
            style={{
              background: selectedRouteId ? '#fff' : '#2563eb',
              color: selectedRouteId ? '#374151' : '#fff',
            }}
          >
            All
          </button>
          {routeArr.map((r) => {
            const rid = String(r.routeId || '')
            const isSelected = String(selectedRouteId) === rid
            return (
              <button
                key={rid}
                type="button"
                onClick={() => onSelectRoute(rid)}
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
        </div>
      </div>

      {/* Table */}
      <div ref={tableScrollRef} className="mt-1.5">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['노선번호', '탑승정류장', '하차정류장', '탑승시간', '하차시간', '소요시간'].map((h) => (
                <th
                  key={h}
                  className="sticky top-[34px] z-[2] border-b border-slate-300 bg-white px-1 py-1.5 text-left text-xs font-semibold"
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
                className={highlightedRowIndex === idx ? 'bg-yellow-50' : undefined}
              >
                <td className="border-b border-slate-100 px-1 py-1.5 text-xs">
                  <span style={getRouteNameStyle(e.routeTypeCd)}>{e.routeName || e.routeId}</span>
                </td>
                <td className="border-b border-slate-100 px-1 py-1.5 text-xs">
                  {e.boardStationName || '-'}
                </td>
                <td className="border-b border-slate-100 px-1 py-1.5 text-xs">
                  {e.alightStationName || '-'}
                </td>
                <td className="border-b border-slate-100 px-1 py-1.5 text-xs">
                  {formatDisplayTime(e.boardTime, sday)}
                </td>
                <td className="border-b border-slate-100 px-1 py-1.5 text-xs">
                  {formatDisplayTime(e.alightTime, sday)}
                </td>
                <td className="border-b border-slate-100 px-1 py-1.5 text-xs">
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
