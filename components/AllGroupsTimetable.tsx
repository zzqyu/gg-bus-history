import React from 'react'
import { AllGroupsTimetableState, RealtimeArrivalMap, StationNumberMaps, TimetableEntry } from '../types'
import { compareRoutes } from '../utils/routeUtils'
import { formatDisplayTime, formatDuration, formatSecondsToMinuteText, getServiceDayNowMinutes } from '../utils/timeUtils'
import { getRouteNameStyle } from '../utils/styleUtils'
import { getAlightStationNumber, getBoardStationNumber } from '../utils/stationNumberUtils'
import { buildRealtimeClockText, buildRealtimeKey, matchRealtimeToTimetableRows, parseRealtimeItemResponse } from '../utils/realtimeUtils'

interface AllGroupsTimetableProps {
  state: AllGroupsTimetableState
  sday: string
  stationNumberMaps: StationNumberMaps
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
  stationNumberMaps,
  highlightedRowIndex,
  selectedRouteIds,
  tableScrollRef,
  onSelectRoutes,
  onMoveToCurrentTime,
  onFold,
}: AllGroupsTimetableProps) {
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
    const nowMin = getServiceDayNowMinutes(now)
    return t < nowMin
  }

  const [recentlyMovedToNow, setRecentlyMovedToNow] = React.useState(false)
  const stickyHeaderRef = React.useRef<HTMLDivElement | null>(null)
  const [tableHeaderTop, setTableHeaderTop] = React.useState(0)
  const [realtimeMap, setRealtimeMap] = React.useState<RealtimeArrivalMap>({})

  const combined: TimetableEntry[] = (state.data && state.data.combined) || []
  const selectedRouteSet = new Set((selectedRouteIds || []).map((x) => String(x)))
  const filtered = selectedRouteSet.size > 0
    ? combined.filter((x) => selectedRouteSet.has(String(x.routeId || '')))
    : combined

  const realtimeFetchKeys = React.useMemo(() => {
    return Array.from(new Set(filtered.map((e) => buildRealtimeKey(e.boardStationId, e.routeId, e.boardOrder))))
      .filter((k) => {
        const [sid, rid, ord] = String(k).split('|')
        return !!sid && !!rid && !!ord
      })
      .slice(0, 120)
      .sort()
  }, [filtered])

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

  const boardWalkByStation = new Map<string, number[]>()
  const alightWalkByStation = new Map<string, number[]>()
  const boardWalkDistanceByStation = new Map<string, number[]>()
  const alightWalkDistanceByStation = new Map<string, number[]>()

  function stationLegendKey(stationId: unknown, stationName: unknown): string {
    const sid = String(stationId || '').trim()
    const sname = String(stationName || '').trim()
    if (sid) return `id:${sid}|name:${sname}`
    return `name:${sname}`
  }

  function pushFiniteWalk(map: Map<string, number[]>, stationKey: string, sec: unknown) {
    const key = String(stationKey || '').trim()
    const value = Number(sec)
    if (!key || key === '-' || !Number.isFinite(value)) return
    const arr = map.get(key) || []
    arr.push(Math.max(0, value))
    map.set(key, arr)
  }

  function pushFiniteDistance(map: Map<string, number[]>, stationKey: string, distance: unknown) {
    const key = String(stationKey || '').trim()
    const value = Number(distance)
    if (!key || key === '-' || !Number.isFinite(value)) return
    const arr = map.get(key) || []
    arr.push(Math.max(0, value))
    map.set(key, arr)
  }

  for (const entry of filtered) {
    const boardKey = stationLegendKey(entry.boardStationId, entry.boardStationName)
    const alightKey = stationLegendKey(entry.alightStationId, entry.alightStationName)
    const board = String(entry.boardStationName || '').trim()
    const alight = String(entry.alightStationName || '').trim()
    if (board) {
      pushFiniteWalk(boardWalkByStation, boardKey, entry.walkToBoardSec)
      pushFiniteDistance(boardWalkDistanceByStation, boardKey, entry.walkToBoardDistance)
    }
    if (alight) {
      pushFiniteWalk(alightWalkByStation, alightKey, entry.walkFromAlightSec)
      pushFiniteDistance(alightWalkDistanceByStation, alightKey, entry.walkFromAlightDistance)
    }
  }

  const boardStationLegendArr = Array.from(new Set(filtered.map((e) => stationLegendKey(e.boardStationId, e.boardStationName))))
    .map((key) => {
      const entry = filtered.find((x) => stationLegendKey(x.boardStationId, x.boardStationName) === key)
      const name = String(entry?.boardStationName || '').trim()
      const index = getBoardStationNumber(stationNumberMaps, String(entry?.boardStationId || ''), name) || 0
      return {
        name,
        index,
        boardWalkSecList: boardWalkByStation.get(key) || [],
        boardWalkDistanceList: boardWalkDistanceByStation.get(key) || [],
      }
    })
    .filter((x) => x.index > 0)
    .sort((a, b) => a.index - b.index)

  const alightStationLegendArr = Array.from(new Set(filtered.map((e) => stationLegendKey(e.alightStationId, e.alightStationName))))
    .map((key) => {
      const entry = filtered.find((x) => stationLegendKey(x.alightStationId, x.alightStationName) === key)
      const name = String(entry?.alightStationName || '').trim()
      const index = getAlightStationNumber(stationNumberMaps, String(entry?.alightStationId || ''), name) || 0
      return {
        name,
        index,
        alightWalkSecList: alightWalkByStation.get(key) || [],
        alightWalkDistanceList: alightWalkDistanceByStation.get(key) || [],
      }
    })
    .filter((x) => x.index > 0)
    .sort((a, b) => a.index - b.index)

  const hasStationLegend = boardStationLegendArr.length > 0 || alightStationLegendArr.length > 0

  React.useEffect(() => {
    let canceled = false
    async function fetchRealtime() {
      if (!realtimeFetchKeys.length) {
        setRealtimeMap({})
        return
      }
      const next: RealtimeArrivalMap = {}
      await Promise.all(realtimeFetchKeys.map(async (k) => {
        try {
          const [stationId, routeId, staOrder] = String(k).split('|')
          const params = new URLSearchParams({ stationId, routeId, staOrder })
          const r = await fetch('/api/realtimeArrivalItem?' + params.toString())
          const j = await r.json()
          const parsed = parseRealtimeItemResponse(j)
          if (parsed) next[k] = parsed
        } catch {
          // ignore per key
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
    for (let i = 0; i < filtered.length; i += 1) {
      const e = filtered[i]
      const key = buildRealtimeKey(e.boardStationId, e.routeId, e.boardOrder)
      if (!grouped[key]) grouped[key] = []
      grouped[key].push({ idx: i, boardText: formatDisplayTime(e.boardTime, sday) })
    }
    for (const key of Object.keys(grouped)) {
      const arr = grouped[key]
      const predict = Array.isArray(realtimeMap[key]?.predictTimes) ? realtimeMap[key].predictTimes : []
      const mapped = matchRealtimeToTimetableRows(arr.map((x) => x.boardText), predict)
      for (let i = 0; i < arr.length; i += 1) {
        out[arr[i].idx] = mapped[i]
      }
    }
    return out
  }, [filtered, realtimeMap, sday])

  function formatWalkLegendText(secList: number[]): string {
    if (!secList || secList.length === 0) return '-'
    const min = Math.min(...secList)
    const max = Math.max(...secList)
    if (min === max) return formatSecondsToMinuteText(min)
    return `${formatSecondsToMinuteText(min)}~${formatSecondsToMinuteText(max)}`
  }

  function formatDistanceText(distanceM: number): string {
    const safe = Math.max(0, Math.round(Number(distanceM) || 0))
    if (safe >= 1000) return `${(safe / 1000).toFixed(2)}km`
    return `${safe}m`
  }

  function formatDistanceLegendText(distList: number[]): string {
    if (!distList || distList.length === 0) return '-'
    const min = Math.min(...distList)
    const max = Math.max(...distList)
    if (min === max) return formatDistanceText(min)
    return `${formatDistanceText(min)}~${formatDistanceText(max)}`
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

  React.useEffect(() => {
    const el = stickyHeaderRef.current
    const tableEl = tableScrollRef.current
    if (!el || !tableEl) return

    const update = () => {
      const stickyRect = el.getBoundingClientRect()
      const tableRect = tableEl.getBoundingClientRect()
      const overlap = Math.max(0, Math.round(stickyRect.bottom - tableRect.top))
      setTableHeaderTop(overlap)
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => update())
      ro.observe(el)
    }

    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      if (ro) ro.disconnect()
    }
  }, [hasStationLegend, displayedRouteArr.length, filtered.length])

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

  return (
    <div className="mb-3.5 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
      {/* Sticky header */}
      <div ref={stickyHeaderRef} className="sticky top-[56px] sm:top-[69px] z-[3] bg-blue-50 pb-1">
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

        {hasStationLegend && (
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
                          <span className="text-slate-500">({formatWalkLegendText(item.boardWalkSecList)} · {formatDistanceLegendText(item.boardWalkDistanceList)})</span>
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
                      <span className="text-slate-500">({formatWalkLegendText(item.alightWalkSecList)} · {formatDistanceLegendText(item.alightWalkDistanceList)})</span>
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
                  className="sticky z-[4] border-b border-indigo-300 bg-indigo-100 px-1 py-1.5 text-left text-xs font-semibold"
                  style={{ top: tableHeaderTop }}
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
                    const boardNo = getBoardStationNumber(stationNumberMaps, String(e.boardStationId || ''), boardName)
                    const boardText = formatDisplayTime(e.boardTime, sday)
                    return (
                      <span className="inline-flex items-center gap-1" title={boardName || '-'}>
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                          {boardNo || '-'}
                        </span>
                        <span>{boardText}</span>
                        {(() => {
                          const clockText = buildRealtimeClockText(realtimeByRowIndex[idx])
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
                    )
                  })()}
                </td>
                <td className="border-b border-slate-300 px-1 py-1.5 text-xs whitespace-nowrap">
                  {(() => {
                    const alightName = String(e.alightStationName || '').trim()
                    const alightNo = getAlightStationNumber(stationNumberMaps, String(e.alightStationId || ''), alightName)
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
