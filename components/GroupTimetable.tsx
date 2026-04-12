import React from 'react'
import { Group, GroupTimetableState, RealtimeArrivalMap, RouteBadgeInfo, TimetableEntry } from '../types'
import { getGroupRouteBadges } from '../utils/routeUtils'
import { formatDisplayTime, formatDuration } from '../utils/timeUtils'
import { getRouteNameStyle } from '../utils/styleUtils'
import { buildRealtimeClockText, buildRealtimeKey, matchRealtimeToTimetableRows, parseRealtimeItemResponse } from '../utils/realtimeUtils'

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
  function parseDisplayMinute(text: string): number | null {
    const m = String(text || '').match(/^(\d+):(\d{2})$/)
    if (!m) return null
    const hh = Number(m[1])
    const mm = Number(m[2])
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
    return hh * 60 + mm
  }

  function isPastDisplayTime(text: string, now: Date = new Date()): boolean {
    const t = parseDisplayMinute(text)
    if (t == null) return false
    const nowMin = now.getHours() * 60 + now.getMinutes()
    return t < nowMin
  }

  const [realtimeMap, setRealtimeMap] = React.useState<RealtimeArrivalMap>({})
  const realtimeFetchKeys = React.useMemo(() => {
    const list = combined || []
    return Array.from(new Set(list.map((e) => buildRealtimeKey(e.boardStationId || group.board.stationId, e.routeId, e.boardOrder))))
      .filter((k) => {
        const [sid, rid, ord] = String(k).split('|')
        return !!sid && !!rid && !!ord
      })
      .slice(0, 80)
      .sort()
  }, [combined, group.board.stationId])

  const routeBadges: RouteBadgeInfo[] = getGroupRouteBadges(group)

  React.useEffect(() => {
    let canceled = false
    async function fetchRealtime() {
      if (!realtimeFetchKeys.length) {
        setRealtimeMap({})
        return
      }
      const next: RealtimeArrivalMap = {}
      await Promise.all(realtimeFetchKeys.map(async (key) => {
        try {
          const [stationId, routeId, staOrder] = String(key).split('|')
          const params = new URLSearchParams({ stationId, routeId, staOrder })
          const r = await fetch('/api/realtimeArrivalItem?' + params.toString())
          const j = await r.json()
          const parsed = parseRealtimeItemResponse(j)
          if (parsed) next[key] = parsed
        } catch {
          // ignore
        }
      }))
      if (!canceled) setRealtimeMap(next)
    }
    fetchRealtime()
    return () => { canceled = true }
  }, [realtimeFetchKeys])

  const realtimeByRowIndex = React.useMemo(() => {
    const out: Record<number, number | null> = {}
    const grouped: Record<string, Array<{ idx: number; boardText: string }>> = {}
    for (let i = 0; i < (combined || []).length; i += 1) {
      const e = combined[i]
      const key = buildRealtimeKey(e.boardStationId || group.board.stationId, e.routeId, e.boardOrder)
      if (!grouped[key]) grouped[key] = []
      grouped[key].push({ idx: i, boardText: formatDisplayTime(e.boardTime, sday) })
    }
    for (const key of Object.keys(grouped)) {
      const rows = grouped[key]
      const predict = Array.isArray(realtimeMap[key]?.predictTimes) ? realtimeMap[key].predictTimes : []
      const mapped = matchRealtimeToTimetableRows(rows.map((x) => x.boardText), predict)
      for (let i = 0; i < rows.length; i += 1) {
        out[rows[i].idx] = mapped[i]
      }
    }
    return out
  }, [combined, realtimeMap, sday, group.board.stationId])

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
                    <span className="inline-flex items-center gap-1">
                      <span>{formatDisplayTime(e.boardTime, sday)}</span>
                      {(() => {
                        const boardText = formatDisplayTime(e.boardTime, sday)
                        const clockText = buildRealtimeClockText(realtimeByRowIndex[cIdx])
                        if (clockText) {
                          return (
                            <span
                              className="rounded px-1 py-0.5 text-[10px] font-semibold"
                              style={{ background: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe' }}
                              title="실시간 도착 시각"
                            >
                            {clockText}
                          </span>
                        )
                      }
                        if (!isPastDisplayTime(boardText)) return null
                        return (
                          <span
                            className="rounded px-1 py-0.5 text-[10px] font-semibold"
                            style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' }}
                            title="이미 지난 시간이력"
                          >
                            지나감
                          </span>
                        )
                      })()}
                    </span>
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
