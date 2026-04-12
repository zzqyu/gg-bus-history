import React from 'react'
import { Group, RealtimeArrivalItem } from '../types'
import { getRouteNameStyle } from '../utils/styleUtils'

interface RealtimeArrivalPanelProps {
  group: Group
  stationType: 'board' | 'alight'
  open: boolean
  onClose: () => void
}

export default function RealtimeArrivalPanel({ group, stationType, open, onClose }: RealtimeArrivalPanelProps) {
  const station = stationType === 'board' ? group.board : group.alight
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [showAll, setShowAll] = React.useState(false)
  const [items, setItems] = React.useState<RealtimeArrivalItem[]>([])

  const allowedRouteIds = React.useMemo(
    () => new Set((group.routes || []).map((r) => String(r.routeId || '')).filter(Boolean)),
    [group]
  )

  const visibleItems = React.useMemo(() => {
    if (showAll) return items
    return items.filter((x) => allowedRouteIds.has(String(x.routeId || '')))
  }, [items, showAll, allowedRouteIds])

  const routeTypeById = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const r of (group.routes || [])) {
      const rid = String(r.routeId || '').trim()
      if (!rid) continue
      if (r.routeTypeCd) m[rid] = String(r.routeTypeCd)
    }
    return m
  }, [group.routes])

  const fetchList = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ stationId: String(station.stationId || '') })
      const r = await fetch('/api/realtimeArrivalList?' + params.toString())
      const j = await r.json()
      const arr = Array.isArray(j?.items) ? j.items : []
      setItems(arr)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [station.stationId])

  React.useEffect(() => {
    if (!open) return
    fetchList()
  }, [open, fetchList])

  if (!open) return null

  return (
    <div className="mt-2 rounded border border-slate-200 bg-white p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-700">
          실시간 도착 · {stationType === 'board' ? '탑승' : '하차'} 정류장 ({station.stationName})
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] hover:bg-slate-50"
            onClick={() => setShowAll((p) => !p)}
          >
            {showAll ? '결과노선만' : '전체노선'}
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] hover:bg-slate-50"
            onClick={fetchList}
          >
            새로고침
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] hover:bg-slate-50"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
      {loading && <div className="text-xs text-slate-500">실시간 조회 중...</div>}
      {!!error && <div className="text-xs text-red-600">{error}</div>}
      {!loading && !error && (
        <div className="max-h-40 overflow-auto text-xs">
          {visibleItems.length === 0 ? (
            <div className="text-slate-500">실시간 정보가 없습니다.</div>
          ) : (
            <ul className="m-0 list-none p-0">
              {visibleItems.map((it, idx) => (
                <li key={`${it.routeId}-${idx}`} className="mb-1 flex items-center justify-between gap-2 rounded border border-slate-100 px-1.5 py-1">
                  <span className="font-semibold" style={getRouteNameStyle(routeTypeById[String(it.routeId || '').trim()])}>
                    {it.routeName || it.routeId}
                  </span>
                  <span className="text-slate-600">
                    {it.predictTime1 != null ? `${it.predictTime1}분` : '-'}
                    {it.predictTime2 != null ? ` / ${it.predictTime2}분` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
