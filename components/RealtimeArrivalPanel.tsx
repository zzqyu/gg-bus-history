import React from 'react'
import { Group, RealtimeArrivalItem } from '../types'
import { canDisplaySeatCount, getRouteNameStyle } from '../utils/styleUtils'

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
    <div className="rounded-b border border-slate-200 bg-white p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-xs font-semibold text-slate-700" title={station.stationName}>
          {station.stationName}
        </div>
        <div className="flex items-center gap-1 whitespace-nowrap">
          <button
            type="button"
            className="whitespace-nowrap rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] hover:bg-slate-50"
            onClick={() => setShowAll((p) => !p)}
          >
            {showAll ? '결과노선만' : '전체노선'}
          </button>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50"
            onClick={fetchList}
            title="새로고침"
            aria-label="새로고침"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50"
            onClick={onClose}
            title="닫기"
            aria-label="닫기"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
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
                    {(() => {
                      const t1 = it.predictTime1
                      const t2 = it.predictTime2
                      const s1 = it.remainSeatCnt1
                      const s2 = it.remainSeatCnt2
                      const allowSeat = canDisplaySeatCount(routeTypeById[String(it.routeId || '').trim()])
                      const p1 = (t1 != null)
                        ? `${t1}분${allowSeat && s1 != null && s1 >= 0 ? `(${s1}석)` : ''}`
                        : '-'
                      const p2 = (t2 != null)
                        ? `${t2}분${allowSeat && s2 != null && s2 >= 0 ? `(${s2}석)` : ''}`
                        : ''
                      return p2 ? `${p1} / ${p2}` : p1
                    })()}
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
