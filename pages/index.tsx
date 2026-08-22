import Head from 'next/head'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  SearchResult,
  GroupTimetableState,
  AllGroupsTimetableState,
  PendingMapPoint,
  DateBounds,
  Group,
  KakaoPlace,
  TimetableEntry,
  StationNumberMaps,
  RealtimeArrivalItem,
} from '../types'
import { getGroupKey, getGroupRouteBadges } from '../utils/routeUtils'
import { getDateBounds, clampDateValue, getQuickDayValue, formatDisplayTime, formatDuration, getServiceDayNowMinutes } from '../utils/timeUtils'
import { toCoordString, parseCoordValue, getPlaceDisplayText } from '../utils/mapUtils'
import PlaceSearchInput from '../components/PlaceSearchInput'
import SearchResultsPanel from '../components/SearchResultsPanel'
import MapControls from '../components/MapControls'
import PendingMapPointBar from '../components/PendingMapPointBar'
import SharePreviewModal from '../components/SharePreviewModal'
import { buildStationNumberMaps, getAlightStationNumber, getBoardStationNumber } from '../utils/stationNumberUtils'
import ResultCard from '../components/result/ResultCard'
import TimetableView from '../components/result/TimetableView'
import DaySwitcher, { getDefaultSday } from '../components/result/DaySwitcher'
import useRealtimeArrival from '../hooks/useRealtimeArrival'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible'

// Dev StrictMode(초기 마운트 이중 실행)에서도 동일 쿼리의 중복 호출을 막기 위한
// 브라우저 전역 in-flight/cache 저장소
type AllGroupsGlobalStore = {
  inFlight?: Record<string, Promise<any>>
  cache?: Record<string, any>
}

type ShareViewType = 'results' | 'all_timetable'

type SharePayload = {
  title: string
  text: string
  url: string
  summaryLines: string[]
  startEndLine: string
  baseTime: string
  items: Array<{
    route: string
    time: string
    desc: string
  }>
}

export default function Home() {
  const [ax, setAx] = useState('')
  const [ay, setAy] = useState('')
  const [bx, setBx] = useState('')
  const [by, setBy] = useState('')
  const [startRadius, setStartRadius] = useState('500')
  const [endRadius, setEndRadius] = useState('500')
  const [sday, setSday] = useState('')
  const [dateBounds, setDateBounds] = useState<DateBounds>({ min: '', max: '' })
  const [result, setResult] = useState<SearchResult | null>(null)
  const [groupTimetables, setGroupTimetables] = useState<Record<string, GroupTimetableState>>({})
  const [allGroupsTimetable, setAllGroupsTimetable] = useState<AllGroupsTimetableState | null>(null)
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null)
  const [startKeyword, setStartKeyword] = useState('')
  const [endKeyword, setEndKeyword] = useState('')
  const [startSearchResults, setStartSearchResults] = useState<KakaoPlace[]>([])
  const [endSearchResults, setEndSearchResults] = useState<KakaoPlace[]>([])
  const [startSearchMsg, setStartSearchMsg] = useState('')
  const [endSearchMsg, setEndSearchMsg] = useState('')
  const [startSearchOpened, setStartSearchOpened] = useState(false)
  const [endSearchOpened, setEndSearchOpened] = useState(false)
  const [pendingMapPoint, setPendingMapPoint] = useState<PendingMapPoint | null>(null)
  const [mapPickTarget, setMapPickTarget] = useState<'start' | 'end' | null>(null)
  const [mapError, setMapError] = useState('')
  const [showGroupList, setShowGroupList] = useState(true)
  const [showAllGroupsTimetable, setShowAllGroupsTimetable] = useState(false)
  const [groupTimetableHidden, setGroupTimetableHidden] = useState<Record<string, boolean>>({})
  const [allGroupsHighlightedRowIndex, setAllGroupsHighlightedRowIndex] = useState(-1)
  const [groupHighlightedRowIndexes, setGroupHighlightedRowIndexes] = useState<Record<string, number>>({})
  const [allGroupsSelectedRouteIds, setAllGroupsSelectedRouteIds] = useState<string[]>([])
  const [locatingStart, setLocatingStart] = useState(false)
  const [locatingEnd, setLocatingEnd] = useState(false)
  const [locatingMap, setLocatingMap] = useState(false)
  const [mapReadyTick, setMapReadyTick] = useState(0)
  const [mobileMainView, setMobileMainView] = useState<'map' | 'results'>('map')
  // P5-T2: 검색 전 화면에서 지도가 화면 전체를 채울 때, 헤더 높이만큼 지도 영역을 아래로
  // 내리기 위해 헤더의 실제 높이를 잰다. 고정 숫자를 쓰지 않는 이유는 P5-T1에서 이미 겪은
  // 문제(고정 숫자 49px가 툴바 줄바꿈 때문에 틀렸던 것) 때문이다.
  const [appHeaderHeight, setAppHeaderHeight] = useState(0)
  // 검색 전 하단 플로팅 패널에서 "지도에서 직접 조정"(반경 설정)을 펼쳤는지 여부
  const [preSearchPanelOpen, setPreSearchPanelOpen] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [searchedHeaderStart, setSearchedHeaderStart] = useState('')
  const [searchedHeaderEnd, setSearchedHeaderEnd] = useState('')

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const mapPickTargetRef = useRef<'start' | 'end' | null>(null)
  const placesRef = useRef<any>(null)
  const geocoderRef = useRef<any>(null)
  const markersRef = useRef<{ start: any; end: any }>({ start: null, end: null })
  const markerImagesRef = useRef<{ start: any; end: any }>({ start: null, end: null })
  const markerLabelsRef = useRef<{ start: any; end: any }>({ start: null, end: null })
  const circlesRef = useRef<{ start: any; end: any }>({ start: null, end: null })
  const groupStationMarkersRef = useRef<any[]>([])
  const groupStationOverlaysRef = useRef<any[]>([])
  const accessLinePolylinesRef = useRef<any[]>([])
  const busRoutePolylinesRef = useRef<any[]>([])
  const busRouteBadgeOverlaysRef = useRef<any[]>([])
  const routeLinePathByRouteIdRef = useRef<Record<string, number[][]>>({})
  const routeLineRenderTokenRef = useRef(0)
  const allGroupsTableScrollRef = useRef<HTMLDivElement>(null)
  const groupTableScrollRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const routeBadgeRowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const resultsSectionRef = useRef<HTMLDivElement>(null)
  // 검색 실패 후 "다시 시도" 버튼이 같은 조건으로 재요청할 수 있도록 마지막 검색 옵션을 기억한다(B11).
  const lastSearchOptsRef = useRef<Parameters<typeof doSearch>[0] | null>(null)
  const defaultMapCenter = { lon: 127.053749, lat: 37.289522 }

  const stationNumberMaps: StationNumberMaps = useMemo(
    () => buildStationNumberMaps((result && result.groups) || [], allGroupsSelectedRouteIds),
    [result, allGroupsSelectedRouteIds]
  )

  const realtimeStationIds = useMemo(
    () => Array.from(new Set((result?.groups || []).map((group) => String(group.board.stationId || '')).filter(Boolean))),
    [result?.groups]
  )
  const realtimeByStationId = useRealtimeArrival(realtimeStationIds)
  const realtimeByGroupKey = useMemo(() => {
    const byGroupKey: Record<string, Record<string, RealtimeArrivalItem>> = {}
    for (const group of result?.groups || []) {
      byGroupKey[getGroupKey(group)] = realtimeByStationId[String(group.board.stationId || '')] || {}
    }
    return byGroupKey
  }, [result?.groups, realtimeByStationId])

  function buildAllGroupsTimetableQueryString(sdayOverride?: string): string {
    const params = new URLSearchParams({ ax, ay, bx, by, aradius: startRadius, bradius: endRadius })
    const effectiveSday = sdayOverride ?? sday
    if (effectiveSday) params.set('sday', effectiveSday)
    return params.toString()
  }

  // sdayOverride: 기준일 전환 직후처럼 `sday` state가 아직 리렌더에 반영되지 않은 시점에
  // 새 값으로 즉시 조회해야 할 때 쓴다(React state 업데이트는 비동기라 클로저의 `sday`가 낡을 수 있음).
  async function requestAllGroupsTimetableOnce(sdayOverride?: string): Promise<any> {
    const query = buildAllGroupsTimetableQueryString(sdayOverride)
    if (typeof window !== 'undefined') {
      const w = window as Window & { __allGroupsGlobalStore?: AllGroupsGlobalStore }
      if (!w.__allGroupsGlobalStore) w.__allGroupsGlobalStore = {}
      if (!w.__allGroupsGlobalStore.inFlight) w.__allGroupsGlobalStore.inFlight = {}
      if (!w.__allGroupsGlobalStore.cache) w.__allGroupsGlobalStore.cache = {}

      const cached = w.__allGroupsGlobalStore.cache[query]
      if (cached) return cached

      const inFlight = w.__allGroupsGlobalStore.inFlight[query]
      if (inFlight) return inFlight

      const p = fetch('/api/allGroupsTimetable?' + query)
        .then((r) => r.json())
        .then((j) => {
          w.__allGroupsGlobalStore!.cache![query] = j
          return j
        })
        .finally(() => {
          if (w.__allGroupsGlobalStore && w.__allGroupsGlobalStore.inFlight) {
            delete w.__allGroupsGlobalStore.inFlight[query]
          }
        })

      w.__allGroupsGlobalStore.inFlight[query] = p
      return p
    }

    const r = await fetch('/api/allGroupsTimetable?' + query)
    return r.json()
  }

  // ─── Utility helpers ───────────────────────────────────────────────

  function getMarkerImage(type: 'start' | 'end') {
    if (typeof window === 'undefined' || !(window as any).kakao || !(window as any).kakao.maps) return null
    const cached = markerImagesRef.current[type]
    if (cached) return cached
    const color = type === 'start' ? '#2563eb' : '#ef4444'
    const text = type === 'start' ? 'S' : 'E'
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
        <path d="M14 1C6.8 1 1 6.8 1 14c0 9.7 11.2 19.9 12.4 21a1 1 0 0 0 1.3 0C15.8 33.9 27 23.7 27 14 27 6.8 21.2 1 14 1z" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="14" cy="14" r="8" fill="#ffffff"/>
        <text x="14" y="17" text-anchor="middle" font-size="9" font-family="sans-serif" fill="${color}">${text}</text>
      </svg>
    `.trim()
    const src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
    const kakao = (window as any).kakao
    const image = new kakao.maps.MarkerImage(
      src,
      new kakao.maps.Size(28, 36),
      { offset: new kakao.maps.Point(14, 36) }
    )
    markerImagesRef.current[type] = image
    return image
  }

  // distance in meters between two lat/lon points (Haversine)
  function computeDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const R = 6371000 // earth radius meters
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  function getMarkerLabelHtml(type: 'start' | 'end') {
    const bg = type === 'start' ? '#2563eb' : '#ef4444'
    const text = type === 'start' ? '출발지' : '도착지'
    return `<div style="background:${bg};color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700;white-space:nowrap;">${text}</div>`
  }

  function updateMarker(type: 'start' | 'end', lon: string, lat: string) {
    const kakao = (window as any).kakao
    if (!mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    const lng = parseCoordValue(lon)
    const ltd = parseCoordValue(lat)
    if (Number.isNaN(lng) || Number.isNaN(ltd)) return
    const pos = new kakao.maps.LatLng(ltd, lng)
    const prev = markersRef.current[type]
    if (!prev) {
      const mk = new kakao.maps.Marker({
        position: pos,
        image: getMarkerImage(type),
        title: type === 'start' ? '출발지' : '도착지',
      })
      mk.setMap(mapRef.current)
      markersRef.current[type] = mk
    } else {
      prev.setPosition(pos)
    }
    const label = markerLabelsRef.current[type]
    if (!label) {
      const overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: getMarkerLabelHtml(type),
        xAnchor: 0.5,
        yAnchor: 2.2,
      })
      overlay.setMap(mapRef.current)
      markerLabelsRef.current[type] = overlay
    } else {
      label.setPosition(pos)
    }
  }

  function updateCircle(type: 'start' | 'end', lon: string, lat: string, radiusMeters: string) {
    const kakao = (window as any).kakao
    if (!mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    const lng = parseCoordValue(lon)
    const ltd = parseCoordValue(lat)
    const rad = Number(radiusMeters)
    if (Number.isNaN(lng) || Number.isNaN(ltd) || Number.isNaN(rad) || rad <= 0) return
    const center = new kakao.maps.LatLng(ltd, lng)
    const strokeColor = type === 'start' ? '#2563eb' : '#ef4444'
    const fillColor = type === 'start' ? '#93c5fd' : '#fca5a5'
    const prev = circlesRef.current[type]
    if (!prev) {
      const circle = new kakao.maps.Circle({
        center,
        radius: rad,
        strokeWeight: 2,
        strokeColor,
        strokeOpacity: 0.8,
        strokeStyle: 'solid',
        fillColor,
        fillOpacity: 0.15,
      })
      circle.setMap(mapRef.current)
      circlesRef.current[type] = circle
      return
    }
    prev.setPosition(center)
    prev.setRadius(rad)
  }

  function clearGroupStationOverlays() {
    for (const marker of groupStationMarkersRef.current) {
      marker.setMap(null)
    }
    for (const overlay of groupStationOverlaysRef.current) {
      overlay.setMap(null)
    }
    groupStationMarkersRef.current = []
    groupStationOverlaysRef.current = []
  }

  function clearBusRoutePolylines() {
    for (const line of busRoutePolylinesRef.current) {
      line.setMap(null)
    }
    for (const ov of busRouteBadgeOverlaysRef.current) {
      ov.setMap(null)
    }
    busRoutePolylinesRef.current = []
    busRouteBadgeOverlaysRef.current = []
  }

  function clearAccessLines() {
    for (const line of accessLinePolylinesRef.current) {
      line.setMap(null)
    }
    accessLinePolylinesRef.current = []
  }

  function renderAccessLines(g: Group) {
    const kakao = (window as any).kakao
    if (!mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    const startLng = parseCoordValue(ax)
    const startLat = parseCoordValue(ay)
    const endLng = parseCoordValue(bx)
    const endLat = parseCoordValue(by)
    const boardLng = parseCoordValue(g.board?.lon)
    const boardLat = parseCoordValue(g.board?.lat)
    const alightLng = parseCoordValue(g.alight?.lon)
    const alightLat = parseCoordValue(g.alight?.lat)
    const nums = [startLng, startLat, endLng, endLat, boardLng, boardLat, alightLng, alightLat]
    if (nums.some((v) => Number.isNaN(v))) return

    clearAccessLines()

    const startToBoard = new kakao.maps.Polyline({
      path: [
        new kakao.maps.LatLng(startLat, startLng),
        new kakao.maps.LatLng(boardLat, boardLng),
      ],
      strokeWeight: 4,
      strokeColor: '#2563eb',
      strokeOpacity: 0.8,
      strokeStyle: 'shortdash',
    })
    startToBoard.setMap(mapRef.current)
    accessLinePolylinesRef.current.push(startToBoard)

    const alightToEnd = new kakao.maps.Polyline({
      path: [
        new kakao.maps.LatLng(alightLat, alightLng),
        new kakao.maps.LatLng(endLat, endLng),
      ],
      strokeWeight: 4,
      strokeColor: '#ef4444',
      strokeOpacity: 0.8,
      strokeStyle: 'shortdash',
    })
    alightToEnd.setMap(mapRef.current)
    accessLinePolylinesRef.current.push(alightToEnd)
  }

  function renderBusRoutePolylines(routePaths: Array<{ routeId: string; routeName?: string; path: number[][] }>, highlightedRouteId: string | null = null) {
    const kakao = (window as any).kakao
    if (!mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    clearBusRoutePolylines()
    const indigo = '#4f46e5'
    const highlighted = String(highlightedRouteId || '')
    routePaths.forEach((item) => {
      const points = (item.path || [])
        .filter((c) => Array.isArray(c) && c.length >= 2)
        .map((c) => new kakao.maps.LatLng(Number(c[1]), Number(c[0])))
      if (points.length < 2) return
      const isHighlighted = highlighted && String(item.routeId) === highlighted
      const color = indigo
      const line = new kakao.maps.Polyline({
        path: points,
        strokeWeight: isHighlighted ? 6 : 4,
        strokeColor: color,
        strokeOpacity: isHighlighted ? 0.95 : 0.7,
        strokeStyle: 'solid',
      })
      line.setMap(mapRef.current)
      busRoutePolylinesRef.current.push(line)

      const label = String(item.routeName || '').trim()
      if (label) {
        const mid = points[Math.floor(points.length / 2)]
        const content = `<div style="background:${indigo};color:#fff;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;line-height:1.2;white-space:nowrap;box-shadow:0 1px 4px rgba(15,23,42,0.25);">${label}</div>`
        const overlay = new kakao.maps.CustomOverlay({
          position: mid,
          content,
          xAnchor: 0.5,
          yAnchor: 1.7,
        })
        overlay.setMap(mapRef.current)
        busRouteBadgeOverlaysRef.current.push(overlay)
      }
    })
  }

  async function fetchRouteLinePath(routeId: string, g?: Group): Promise<number[][]> {
    const key = String(routeId || '').trim()
    if (!key || !g) return []
    const boardx = Number(g.board?.lon)
    const boardy = Number(g.board?.lat)
    const alightx = Number(g.alight?.lon)
    const alighty = Number(g.alight?.lat)
    if ([boardx, boardy, alightx, alighty].some((v) => Number.isNaN(v))) return []
    const cacheKey = `${key}|${boardx.toFixed(6)},${boardy.toFixed(6)}|${alightx.toFixed(6)},${alighty.toFixed(6)}`
    const cached = routeLinePathByRouteIdRef.current[cacheKey]
    if (cached && cached.length) return cached
    try {
      const params = new URLSearchParams({
        routeId: key,
        boardx: String(boardx),
        boardy: String(boardy),
        alightx: String(alightx),
        alighty: String(alighty),
      })
      const r = await fetch('/api/routeLine?' + params.toString())
      const j = await r.json()
      const path = Array.isArray(j?.path) ? j.path : []
      routeLinePathByRouteIdRef.current[cacheKey] = path
      return path
    } catch (err) {
      // 지도 위 노선 폴리라인은 장식적 요소라 토스트로 방해하지 않는다 — 실패해도 로그만 남긴다(B10).
      console.warn('[fetchRouteLinePath] 노선 경로를 불러오지 못했습니다:', err instanceof Error ? err.message : err)
      return []
    }
  }

  function getPrefetchedCombinedForGroup(g: Group): TimetableEntry[] {
    const data = allGroupsTimetable && allGroupsTimetable.data ? allGroupsTimetable.data.combined : []
    const boardName = String(g?.board?.stationName || '').trim()
    const alightName = String(g?.alight?.stationName || '').trim()
    const allowedRouteIds = new Set((g.routes || []).map((r) => String(r.routeId || '')).filter(Boolean))
    const walkToBoardSec = Number(g?.walk?.startToBoard?.timeSec || 0)
    const walkFromAlightSec = Number(g?.walk?.alightToEnd?.timeSec || 0)
    const walkTotalSec = Number(g?.walk?.totalTimeSec || (walkToBoardSec + walkFromAlightSec) || 0)
    return (data || [])
      .filter((entry) => {
        const eBoard = String(entry?.boardStationName || '').trim()
        const eAlight = String(entry?.alightStationName || '').trim()
        const rid = String(entry?.routeId || '').trim()
        return eBoard === boardName && eAlight === alightName && allowedRouteIds.has(rid)
      })
      .map((entry) => ({
        ...entry,
        walkToBoardSec,
        walkFromAlightSec,
        walkTotalSec,
      }))
  }

  function getBoardingRouteIdForGroup(groupKey: string, g: Group): string | null {
    const selectedRouteId = groupTimetables[groupKey]?.selectedRouteId
    if (selectedRouteId) return String(selectedRouteId)

    let entries = getCombinedForGroup(groupKey)
    if (!entries.length) entries = getPrefetchedCombinedForGroup(g)
    if (!entries.length) return String(g.routes?.[0]?.routeId || '') || null

    const now = new Date()
    const nowMinutes = getServiceDayNowMinutes(now)
    const walkToBoardMinutes = Math.ceil((Number(entries[0]?.walkToBoardSec || 0) || 0) / 60)
    const earliestBoardMinutes = nowMinutes + walkToBoardMinutes

    const candidates = entries
      .map((entry) => {
        const boardMin = getDisplayMinutes(entry.boardTime)
        const alightMin = getDisplayMinutes(entry.alightTime)
        return {
          routeId: String(entry.routeId || ''),
          boardMin,
          alightMin,
        }
      })
      .filter((x) => x.routeId && x.boardMin != null && x.alightMin != null) as Array<{ routeId: string; boardMin: number; alightMin: number }>

    if (!candidates.length) return String(g.routes?.[0]?.routeId || '') || null
    const normalized = candidates.map((x) => {
      let board = x.boardMin
      let alight = x.alightMin
      while (board < earliestBoardMinutes) {
        board += 1440
        alight += 1440
      }
      return { ...x, boardMin: board, alightMin: alight }
    })
    normalized.sort((a, b) => (a.alightMin - b.alightMin) || (a.boardMin - b.boardMin))
    return normalized[0]?.routeId || null
  }

  async function renderSelectedGroupRouteLines(groupKey: string, g: Group): Promise<void> {
    const token = ++routeLineRenderTokenRef.current
    const routeIds = (g.routes || []).map((r) => String(r.routeId || '')).filter(Boolean)
    if (!routeIds.length) {
      clearBusRoutePolylines()
      return
    }
    const highlightedRouteId = getBoardingRouteIdForGroup(groupKey, g)
    const targetRouteId = highlightedRouteId && routeIds.includes(highlightedRouteId)
      ? highlightedRouteId
      : routeIds[0]
    const targetPath = await fetchRouteLinePath(targetRouteId, g)
    if (token !== routeLineRenderTokenRef.current) return
    const targetRoute = (g.routes || []).find((x) => String(x.routeId || '') === String(targetRouteId))
    const paths = (targetPath || []).length >= 2 ? [{ routeId: targetRouteId, routeName: String(targetRoute?.routeName || targetRouteId), path: targetPath }] : []
    renderBusRoutePolylines(paths, targetRouteId)
  }

  function renderGroupStationOverlays(groups: Group[]) {
    const kakao = (window as any).kakao
    if (!mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    clearGroupStationOverlays()
    const list = groups || []
    const posMap: Record<string, { position: any; labels: string[]; dedup: Set<string> }> = {}
    for (let idx = 0; idx < list.length; idx += 1) {
      const g = list[idx]
      const board = g && g.board ? g.board : null
      const alight = g && g.alight ? g.alight : null
      const points = [
        { type: 'board', station: board },
        { type: 'alight', station: alight },
      ]
      for (const p of points) {
        if (!p.station) continue
        const lon = Number(p.station.lon)
        const lat = Number(p.station.lat)
        if (Number.isNaN(lon) || Number.isNaN(lat)) continue
        const key = `${lon.toFixed(6)},${lat.toFixed(6)}`
        const pos = new kakao.maps.LatLng(lat, lon)
        if (!posMap[key]) {
          const marker = new kakao.maps.Marker({ position: pos, title: `${p.station.stationName || ''}` })
          marker.setMap(mapRef.current)
          groupStationMarkersRef.current.push(marker)
          posMap[key] = { position: pos, labels: [], dedup: new Set<string>() }
        }
        const bg = p.type === 'board' ? '#2563eb' : '#ef4444'
        const stationId = String(p.station.stationId || '').trim()
        const stationName = String(p.station.stationName || '').trim()
        const stationNo = p.type === 'board'
          ? getBoardStationNumber(stationNumberMaps, stationId, stationName)
          : getAlightStationNumber(stationNumberMaps, stationId, stationName)
        const prefix = p.type === 'board' ? 'A' : 'B'
        const labelName = stationName || `결과 ${idx + 1} ${p.type === 'board' ? '탑승' : '하차'}`
        const txt = stationNo != null ? `[${prefix}${stationNo}] ${labelName}` : labelName
        const labelKey = `${prefix}|${stationId}|${labelName}|${stationNo || '-'}`
        if (!posMap[key].dedup.has(labelKey)) {
          posMap[key].dedup.add(labelKey)
          posMap[key].labels.push(`<div style="background:${bg};color:#fff;padding:1px 6px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap;margin-bottom:1px;line-height:1.2;">${txt}</div>`)
        }
      }
    }
    for (const key of Object.keys(posMap)) {
      const item = posMap[key]
      const content = `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);">${item.labels.join('')}</div>`
      const overlay = new kakao.maps.CustomOverlay({ position: item.position, content, xAnchor: 0.5, yAnchor: 1.25 })
      overlay.setMap(mapRef.current)
      groupStationOverlaysRef.current.push(overlay)
    }
  }

  function focusStartEndOnMap() {
    const kakao = (window as any).kakao
    if (!mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    const startLng = parseCoordValue(ax)
    const startLat = parseCoordValue(ay)
    const endLng = parseCoordValue(bx)
    const endLat = parseCoordValue(by)
    if ([startLng, startLat, endLng, endLat].some((v) => Number.isNaN(v))) return
    const startPos = new kakao.maps.LatLng(startLat, startLng)
    const endPos = new kakao.maps.LatLng(endLat, endLng)
    if (startLng === endLng && startLat === endLat) {
      mapRef.current.setCenter(startPos)
      mapRef.current.setLevel(4)
      return
    }
    const bounds = new kakao.maps.LatLngBounds()
    bounds.extend(startPos)
    bounds.extend(endPos)
    mapRef.current.setBounds(bounds)
  }

  function focusSelectedGroupOnMap(g: Group) {
    const kakao = (window as any).kakao
    if (!mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    const startLng = parseCoordValue(ax)
    const startLat = parseCoordValue(ay)
    const endLng = parseCoordValue(bx)
    const endLat = parseCoordValue(by)
    const boardLng = parseCoordValue(g.board?.lon)
    const boardLat = parseCoordValue(g.board?.lat)
    const alightLng = parseCoordValue(g.alight?.lon)
    const alightLat = parseCoordValue(g.alight?.lat)
    const nums = [startLng, startLat, endLng, endLat, boardLng, boardLat, alightLng, alightLat]
    if (nums.some((v) => Number.isNaN(v))) {
      focusStartEndOnMap()
      return
    }
    const bounds = new kakao.maps.LatLngBounds()
    bounds.extend(new kakao.maps.LatLng(startLat, startLng))
    bounds.extend(new kakao.maps.LatLng(endLat, endLng))
    bounds.extend(new kakao.maps.LatLng(boardLat, boardLng))
    bounds.extend(new kakao.maps.LatLng(alightLat, alightLng))
    mapRef.current.setBounds(bounds)
  }

  function compactHeaderPlaceText(text: string): string {
    const src = String(text || '').trim()
    if (!src) return src
    if (src.includes(',')) return src
    const parts = src.split(/\s+/).filter(Boolean)
    if (parts.length <= 3) return src
    const guLikeIndex = parts.findIndex((p, idx) => idx > 0 && /[구군시]$/.test(p))
    if (guLikeIndex >= 0) {
      return parts.slice(guLikeIndex).join(' ')
    }
    return parts.slice(Math.max(0, parts.length - 3)).join(' ')
  }

  function resolveAddressTextByCoord(lon: string, lat: string): Promise<string> {
    return new Promise((resolve) => {
      const kakao = (window as any).kakao
      if (typeof window === 'undefined' || !kakao || !kakao.maps || !kakao.maps.services || !geocoderRef.current) {
        resolve('')
        return
      }
      geocoderRef.current.coord2Address(Number(lon), Number(lat), (res: any, status: any) => {
        if (status !== kakao.maps.services.Status.OK || !res || !res[0]) {
          resolve('')
          return
        }
        const item = res[0]
        const road = item && item.road_address ? item.road_address.address_name : ''
        const jibun = item && item.address ? item.address.address_name : ''
        resolve(String(road || jibun || '').trim())
      })
    })
  }

  // ─── State helpers ─────────────────────────────────────────────────

  function resetTimetableViews(options: { keepExpandedGroup?: boolean } = {}) {
    setGroupTimetables({})
    setAllGroupsTimetable(null)
    // Cancel any in-flight prefetch so its stale result doesn't overwrite new state
    prefetchPromiseRef.current = null
    setShowGroupList(true)
    setShowAllGroupsTimetable(false)
    setGroupTimetableHidden({})
    setAllGroupsHighlightedRowIndex(-1)
    setGroupHighlightedRowIndexes({})
    setAllGroupsSelectedRouteIds([])
    clearAccessLines()
    if (!options.keepExpandedGroup) setExpandedGroupKey(null)
  }

  function setStartPoint(lon: string, lat: string) {
    setAx(toCoordString(lon))
    setAy(toCoordString(lat))
  }

  function setEndPoint(lon: string, lat: string) {
    setBx(toCoordString(lon))
    setBy(toCoordString(lat))
  }

  function swapStartEndPoints() {
    setAx(bx); setAy(by)
    setBx(ax); setBy(ay)
    setStartKeyword(endKeyword)
    setEndKeyword(startKeyword)
    setStartRadius(endRadius)
    setEndRadius(startRadius)
  }

  async function getCurrentLocationAndSet(type: 'start' | 'end') {
    if (!navigator.geolocation) {
      toast.error('이 브라우저는 현재 위치 기능을 지원하지 않습니다.')
      return
    }
    if (type === 'start') setLocatingStart(true)
    else setLocatingEnd(true)
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      )
      const lon = toCoordString(pos.coords.longitude)
      const lat = toCoordString(pos.coords.latitude)
      // 즉시 좌표를 반영하고, 역지오코딩 결과는 비동기로 업데이트합니다.
      const fallbackText = `${lat}, ${lon}`
      if (type === 'start') {
        setStartPoint(lon, lat)
        setStartKeyword(fallbackText)
      } else {
        setEndPoint(lon, lat)
        setEndKeyword(fallbackText)
      }
      // 비동기 역지오코딩: 결과가 있으면 키워드를 업데이트
      resolveAddressTextByCoord(lon, lat).then((addressText) => {
        const keywordText = addressText || fallbackText
        if (type === 'start') setStartKeyword(keywordText)
        else setEndKeyword(keywordText)
      }).catch(() => {
        // 실패해도 무시하고 기존 좌표 텍스트 유지
      })
      const kakao = (window as any).kakao
      if (mapRef.current && kakao && kakao.maps) {
        mapRef.current.panTo(new kakao.maps.LatLng(Number(lat), Number(lon)))
      }
      resetTimetableViews()
    } catch {
      toast.error('현재 위치를 가져오지 못했습니다. 위치 권한을 확인하세요.')
    } finally {
      if (type === 'start') setLocatingStart(false)
      else setLocatingEnd(false)
    }
  }

  async function moveMapToCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error('이 브라우저는 현재 위치 기능을 지원하지 않습니다.')
      return
    }
    setLocatingMap(true)
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      )
      const kakao = (window as any).kakao
      if (mapRef.current && kakao && kakao.maps) {
        const center = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude)
        mapRef.current.setCenter(center)
        mapRef.current.setLevel(4)
      }
    } catch {
      toast.error('현재 위치를 가져오지 못했습니다. 위치 권한을 확인하세요.')
    } finally {
      setLocatingMap(false)
    }
  }

  // 기준일 전환(DaySwitcher/TimetableView의 DateBasisControl 공용). 화면 모드는 유지한 채
  // 이력 캐시만 지우고 새 기준일로 즉시 재조회한다 — 예전 `resetTimetableViews`는 항상
  // showGroupList 모드로 돌아갔는데, 결과/시간이력 화면 어디서든 날짜를 바꿀 수 있어야 하므로
  // 화면 전환은 하지 않는다.
  async function handleSdayChange(v: string) {
    const next = clampDateValue(v, dateBounds.min, dateBounds.max)
    if (next === sday) return
    setSday(next)
    setGroupTimetables({})
    setGroupTimetableHidden({})
    setGroupHighlightedRowIndexes({})
    setAllGroupsHighlightedRowIndex(-1)
    setAllGroupsSelectedRouteIds([])
    prefetchPromiseRef.current = null
    if (!result || result.loading || result.error) return
    setAllGroupsTimetable({ loading: true })
    try {
      const j = await requestAllGroupsTimetableOnce(next)
      setAllGroupsTimetable({ loading: false, data: j })
    } catch (err) {
      console.error('[handleSdayChange] 통합 시간이력 재조회 실패:', err instanceof Error ? err.message : err)
      setAllGroupsTimetable({ loading: false, error: '통합 시간이력을 불러오지 못했습니다.' })
      toast.error('기준일을 바꾸는 중 오류가 발생했습니다. 다시 시도해 주세요.')
    }
  }

  function scrollToPageTop() {
    if (typeof window === 'undefined') return
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleStartRadiusChange(v: string) {
    setStartRadius(v)
    resetTimetableViews()
  }

  function handleEndRadiusChange(v: string) {
    setEndRadius(v)
    resetTimetableViews()
  }

  function selectPlace(type: 'start' | 'end', place: KakaoPlace) {
    const lon = place.x
    const lat = place.y
    const keywordText = getPlaceDisplayText(place)
    if (type === 'start') {
      setStartPoint(lon, lat)
      if (keywordText) setStartKeyword(keywordText)
      setStartSearchResults([])
      setStartSearchMsg('')
      setStartSearchOpened(false)
    } else {
      setEndPoint(lon, lat)
      if (keywordText) setEndKeyword(keywordText)
      setEndSearchResults([])
      setEndSearchMsg('')
      setEndSearchOpened(false)
    }
    const kakao = (window as any).kakao
    if (mapRef.current && typeof window !== 'undefined' && kakao && kakao.maps) {
      const pos = new kakao.maps.LatLng(Number(lat), Number(lon))
      mapRef.current.panTo(pos)
    }
    resetTimetableViews()
  }

  function beginMapPointPick(type: 'start' | 'end') {
    mapPickTargetRef.current = type
    setMapPickTarget(type)
    setPendingMapPoint(null)
    setPreSearchPanelOpen(true)
  }

  function cancelMapPointPick() {
    mapPickTargetRef.current = null
    setMapPickTarget(null)
  }

  function applyMapPoint(type: 'start' | 'end', point: PendingMapPoint) {
    const { lon, lat } = point
    const fallbackText = `${toCoordString(lat)}, ${toCoordString(lon)}`
    // 좌표는 역지오코딩 응답을 기다리지 않고 즉시 반영한다. 지도 클릭 직후에도
    // 마커·검색어가 먼저 갱신되어야 하며, 주소 변환은 완료되면 검색어만 보완한다.
    if (type === 'start') {
      setStartPoint(lon, lat)
      setStartKeyword(fallbackText)
    } else {
      setEndPoint(lon, lat)
      setEndKeyword(fallbackText)
    }
    mapPickTargetRef.current = null
    setMapPickTarget(null)
    setPendingMapPoint(null)
    resetTimetableViews()

    resolveAddressTextByCoord(lon, lat).then((addressText) => {
      if (!addressText) return
      if (type === 'start') setStartKeyword(addressText)
      else setEndKeyword(addressText)
    }).catch(() => {
      // 좌표와 좌표 텍스트는 이미 반영됐으므로 주소 변환 실패는 무시한다.
    })
  }

  function applyPendingMapPoint(type: 'start' | 'end') {
    if (!pendingMapPoint) return
    applyMapPoint(type, pendingMapPoint)
  }

  function searchPlace(type: 'start' | 'end') {
    const keyword = type === 'start' ? startKeyword : endKeyword
    if (type === 'start') setStartSearchOpened(true)
    else setEndSearchOpened(true)
    if (!keyword || !keyword.trim()) {
      if (type === 'start') { setStartSearchResults([]); setStartSearchMsg('검색어를 입력하세요.') }
      else { setEndSearchResults([]); setEndSearchMsg('검색어를 입력하세요.') }
      return
    }
    const kakao = (window as any).kakao
    if (!placesRef.current || !mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    if (type === 'start') setStartSearchMsg('검색 중...')
    else setEndSearchMsg('검색 중...')

    const runAddressSearchFallback = () => {
      if (!geocoderRef.current || !kakao.maps.services) {
        if (type === 'start') { setStartSearchResults([]); setStartSearchMsg('검색 결과가 없습니다.') }
        else { setEndSearchResults([]); setEndSearchMsg('검색 결과가 없습니다.') }
        return
      }
      geocoderRef.current.addressSearch(keyword.trim(), (data: any[], status: any) => {
        if (status !== kakao.maps.services.Status.OK || !data || data.length === 0) {
          if (type === 'start') { setStartSearchResults([]); setStartSearchMsg('검색 결과가 없습니다.') }
          else { setEndSearchResults([]); setEndSearchMsg('검색 결과가 없습니다.') }
          return
        }
        const mapped: KakaoPlace[] = data
          .map((item: any) => ({
            place_name: String(item && (item.address_name || (item.road_address && item.road_address.address_name) || '')).trim(),
            address_name: String(item && item.address_name ? item.address_name : '').trim(),
            road_address_name: String(item && item.road_address && item.road_address.address_name ? item.road_address.address_name : '').trim(),
            x: String(item && item.x ? item.x : ''),
            y: String(item && item.y ? item.y : ''),
          }))
          .filter((item) => item.x && item.y)
        if (type === 'start') {
          setStartSearchResults(mapped)
          setStartSearchMsg(mapped.length === 0 ? '검색 결과가 없습니다.' : '')
        } else {
          setEndSearchResults(mapped)
          setEndSearchMsg(mapped.length === 0 ? '검색 결과가 없습니다.' : '')
        }
      })
    }

    placesRef.current.keywordSearch(keyword.trim(), (data: KakaoPlace[], status: any) => {
      if (status !== kakao.maps.services.Status.OK || !data || data.length === 0) {
        runAddressSearchFallback()
        return
      }
      if (type === 'start') { setStartSearchResults(data); setStartSearchMsg('') }
      else { setEndSearchResults(data); setEndSearchMsg('') }
    })
  }

  function handlePlaceKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>, type: 'start' | 'end') {
    if (e.key !== 'Enter') return
    e.preventDefault()
    searchPlace(type)
  }

  // ─── API calls ─────────────────────────────────────────────────────

  async function doSearch(opts: {
    ax: string
    ay: string
    bx: string
    by: string
    aradius: string
    bradius: string
    sday: string
    startLabel?: string
    endLabel?: string
  }) {
    setResult({ loading: true })
    const startLng = parseCoordValue(opts.ax)
    const startLat = parseCoordValue(opts.ay)
    const endLng = parseCoordValue(opts.bx)
    const endLat = parseCoordValue(opts.by)
    if ([startLng, startLat, endLng, endLat].some((v) => Number.isNaN(v))) {
      setResult({ error: '출발지와 도착지를 먼저 선택하세요.' })
      return
    }
    // 차단: 출발/도착지 간 거리가 500m 미만이면 검색하지 않음
    try {
      const dist = computeDistanceMeters(startLat, startLng, endLat, endLng)
      if (dist < 500) {
        setResult({ error: '출발지와 도착지가 너무 가깝습니다. 500m 이상 떨어진 지점을 선택하세요.' })
        return
      }
    } catch (e) {
      // 거리 계산 실패 시 기본 동작(검색 진행)
    }
    resetTimetableViews()
    lastSearchOptsRef.current = opts
    const params = new URLSearchParams({
      ax: opts.ax, ay: opts.ay, bx: opts.bx, by: opts.by,
      aradius: opts.aradius || startRadius, bradius: opts.bradius || endRadius,
    })
    if (opts.sday) params.set('sday', opts.sday)
    try {
      const r = await fetch('/api/findRoutes?' + params.toString())
      const j = await r.json()
      setShowAllGroupsTimetable(false)
      setShowGroupList(true)
      setAllGroupsSelectedRouteIds([])
      setResult(j)
      // 성공이든 API 에러(j.error)든 결과 탭으로 전환한다 — 실패 메시지를 지도 탭 뒤에 숨기지 않는다(B2/B11).
      setMobileMainView('results')
      if (j && !j.error) {
        setSearchedHeaderStart(compactHeaderPlaceText((opts.startLabel || `${opts.ay}, ${opts.ax}`).trim()))
        setSearchedHeaderEnd(compactHeaderPlaceText((opts.endLabel || `${opts.by}, ${opts.bx}`).trim()))
      }
    } catch (err) {
      console.error('[doSearch] findRoutes 요청 실패:', err instanceof Error ? err.message : err)
      setResult({ error: '검색에 실패했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.' })
      setMobileMainView('results')
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await doSearch({
      ax,
      ay,
      bx,
      by,
      aradius: startRadius,
      bradius: endRadius,
      sday,
      startLabel: startKeyword,
      endLabel: endKeyword,
    })
  }

  async function fetchGroupTimetable(g: Group, routeId: string | null = null) {
    const key = getGroupKey(g)
    setShowAllGroupsTimetable(false)
    setGroupTimetableHidden((p) => ({ ...p, [key]: false }))
    setGroupTimetables((p) => ({ ...p, [key]: { loading: true } }))
    try {
      const params = new URLSearchParams({
        boardStationId: g.board.stationId,
        alightStationId: g.alight.stationId,
      })
      if (sday) params.set('sday', sday)
      try {
        const allowed = (g.routes || []).map((x) => x.routeId).filter(Boolean).join(',')
        if (allowed) params.set('allowedRouteIds', allowed)
      } catch {
        // ignore
      }
      if (routeId) params.set('routeId', routeId)
      const r = await fetch('/api/groupTimetable?' + params.toString())
      const j = await r.json()
      setGroupTimetables((p) => ({ ...p, [key]: { loading: false, data: j, selectedRouteId: routeId || null } }))
    } catch (err) {
      console.error('[fetchGroupTimetable] 요청 실패:', err instanceof Error ? err.message : err)
      setGroupTimetables((p) => ({ ...p, [key]: { loading: false, error: '노선별 시간표를 불러오지 못했습니다.', selectedRouteId: routeId || null } }))
      toast.error('노선별 시간표를 불러오지 못했습니다. 다시 시도해 주세요.')
    }
  }

  async function fetchAllGroupsTimetable() {
    // Always reset route filter when the table is opened
    setAllGroupsSelectedRouteIds([])
    // Already have data → just show it. (에러 상태는 여기서 걸러지지 않는다 — B11: "다시 시도"
    // 버튼이 이 함수를 다시 불렀을 때 실제로 재요청되어야 하기 때문에, 에러였던 이전 상태는
    // 캐시로 취급하지 않는다.)
    if (allGroupsTimetable && !allGroupsTimetable.loading && allGroupsTimetable.data) {
      setShowAllGroupsTimetable(true)
      setShowGroupList(false)
      return
    }
    // Prefetch is already in flight → show loading UI and wait; no duplicate fetch
    if (prefetchPromiseRef.current) {
      setShowAllGroupsTimetable(true)
      setShowGroupList(false)
      await prefetchPromiseRef.current
      return
    }
    // No data and no in-flight request → start fresh fetch
    setAllGroupsTimetable({ loading: true })
    setShowAllGroupsTimetable(true)
    setShowGroupList(false)
    try {
      const j = await requestAllGroupsTimetableOnce()
      setAllGroupsTimetable({ loading: false, data: j })
    } catch (err) {
      console.error('[fetchAllGroupsTimetable] 요청 실패:', err instanceof Error ? err.message : err)
      setAllGroupsTimetable({ loading: false, error: '통합 시간이력을 불러오지 못했습니다.' })
    }
  }

  async function fetchAllGroupsTimetableAndFocus() {
    await fetchAllGroupsTimetable()
    setTimeout(() => {
      moveAllGroupsToCurrentTime()
      const tableContainer = allGroupsTableScrollRef.current
      if (tableContainer && typeof tableContainer.scrollIntoView === 'function') {
        tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 80)
  }

  // Prefetcher: fetch all-groups timetable without switching UI
  const prefetchPromiseRef = useRef<Promise<void> | null>(null)
  async function prefetchAllGroupsTimetable(): Promise<void> {
    // If already have data, nothing to do
    if (allGroupsTimetable && allGroupsTimetable.data) return
    // If a prefetch is already in progress, return the existing promise so callers can await it
    if (prefetchPromiseRef.current) return prefetchPromiseRef.current

    const p = (async () => {
      setAllGroupsTimetable({ loading: true })
      try {
        const j = await requestAllGroupsTimetableOnce()
        setAllGroupsTimetable({ loading: false, data: j })
      } catch (err) {
        // 백그라운드 프리페치라 토스트로 방해하지 않는다(B5) — 사용자가 나중에 "모든 결과 통합
        // 시간이력" 버튼을 누르면 이 에러 상태가 뜨고 그때 재시도할 수 있다.
        console.warn('[prefetchAllGroupsTimetable] 프리페치 실패:', err instanceof Error ? err.message : err)
        setAllGroupsTimetable({ loading: false, error: '통합 시간이력을 불러오지 못했습니다.' })
      } finally {
        prefetchPromiseRef.current = null
      }
    })()

    prefetchPromiseRef.current = p
    return p
  }

  function handleSelectGroupRoute(groupKey: string, g: Group, routeId: string | null) {
    const gt = groupTimetables[groupKey]
    if (!gt || !gt.data) {
      fetchGroupTimetable(g, routeId)
      return
    }
    setGroupTimetables((prev) => ({ ...prev, [groupKey]: { ...prev[groupKey], selectedRouteId: routeId } }))
  }

  // ─── Scroll helpers ────────────────────────────────────────────────

  function getDisplayMinutes(dateTime?: string): number | null {
    const t = formatDisplayTime(dateTime, sday)
    const m = String(t).match(/^(\d+):(\d{2})$/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }

  function getNextBoardRowIndex(entries: TimetableEntry[]): number {
    if (!entries || entries.length === 0) return -1
    const now = new Date()
    const nowMinutes = getServiceDayNowMinutes(now)
    for (let i = 0; i < entries.length; i += 1) {
      const mins = getDisplayMinutes(entries[i] && entries[i].boardTime)
      if (mins != null && mins >= nowMinutes) return i
    }
    return 0
  }

  function scrollTableToRow(container: HTMLDivElement | null, rowIndex: number) {
    if (!container || rowIndex < 0) return
    const row = container.querySelector(`[data-row-index="${rowIndex}"]`)
    if (!row || typeof (row as HTMLElement).scrollIntoView !== 'function') return
    ;(row as HTMLElement).scrollIntoView({ block: 'nearest' })
  }

  function moveAllGroupsToCurrentTime() {
    const combinedAll = (allGroupsTimetable && allGroupsTimetable.data && allGroupsTimetable.data.combined) || []
    const selectedRouteSet = new Set((allGroupsSelectedRouteIds || []).map((x) => String(x)))
    const entries = selectedRouteSet.size > 0
      ? combinedAll.filter((e) => selectedRouteSet.has(String(e.routeId || '')))
      : combinedAll
    const rowIndex = getNextBoardRowIndex(entries)
    if (rowIndex < 0) return
    setAllGroupsHighlightedRowIndex(rowIndex)
    setTimeout(() => scrollTableToRow(allGroupsTableScrollRef.current, rowIndex), 0)
  }

  function moveGroupToCurrentTime(groupKey: string) {
    const gt = groupTimetables[groupKey]
    if (!gt || gt.loading || gt.error || !gt.data) return
    let entries: TimetableEntry[] = []
    if (gt.selectedRouteId) {
      const tt = (gt.data.timetables || []).find((x) => String(x.routeId) === String(gt.selectedRouteId))
      if (tt && tt.entries) {
        entries = tt.entries.map((e) => ({
          ...e,
          routeId: tt.routeId,
          routeName: tt.routeName,
          routeTypeCd: tt.routeTypeCd,
          orderGap: tt.orderGap,
          boardOrder: tt.boardOrder,
          alightOrder: tt.alightOrder,
        }))
      }
    } else {
      entries = gt.data.combined || []
    }
    const rowIndex = getNextBoardRowIndex(entries)
    if (rowIndex < 0) return
    setGroupHighlightedRowIndexes((prev) => ({ ...prev, [groupKey]: rowIndex }))
    const container = groupTableScrollRefs.current[groupKey]
    setTimeout(() => scrollTableToRow(container ?? null, rowIndex), 0)
  }

  function getCombinedForGroup(groupKey: string): TimetableEntry[] {
    const gt = groupTimetables[groupKey]
    if (!gt || !gt.data) return []
    const grp = (result && result.groups ? result.groups : []).find((gg) => getGroupKey(gg) === groupKey)
    const walkToBoardSec = Number(grp?.walk?.startToBoard?.timeSec || 0)
    const walkFromAlightSec = Number(grp?.walk?.alightToEnd?.timeSec || 0)
    const walkTotalSec = Number(grp?.walk?.totalTimeSec || (walkToBoardSec + walkFromAlightSec) || 0)
    if (gt.selectedRouteId) {
      const tt = (gt.data.timetables || []).find((x) => String(x.routeId) === String(gt.selectedRouteId))
      if (tt && tt.entries) {
        return tt.entries.map((e) => ({
          ...e,
          routeId: tt.routeId,
          routeName: tt.routeName,
          routeTypeCd: tt.routeTypeCd,
          orderGap: tt.orderGap,
          boardOrder: tt.boardOrder,
          alightOrder: tt.alightOrder,
          walkToBoardSec,
          walkFromAlightSec,
          walkTotalSec,
        }))
      }
      return []
    }
    return (gt.data.combined || []).map((e) => ({
      ...e,
      walkToBoardSec,
      walkFromAlightSec,
      walkTotalSec,
    }))
  }

  // 그룹별 시간표를 아직 명시적으로 안 열어봤어도(=groupTimetables에 캐시가 없어도), 검색 직후
  // 자동 프리페치되는 allGroupsTimetable에서 이 그룹에 해당하는 항목만 걸러 카드에 바로 보여준다.
  // (구 `ResultsSection.tsx`의 `getPrefetchedCombinedEntries`를 그대로 옮김)
  function getPrefetchedCombinedEntries(g: Group): TimetableEntry[] {
    const allCombinedEntries = allGroupsTimetable?.data?.combined || []
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
      .map((entry) => ({ ...entry, walkToBoardSec, walkFromAlightSec, walkTotalSec }))
  }

  // ResultCard에 넘길 최종 combined — 사용자가 노선을 선택해 명시적으로 불러온 데이터가 있으면
  // 그걸 우선하고, 없으면 프리페치된 통합 이력에서 골라 쓴다.
  function getEffectiveCombinedForGroup(g: Group): TimetableEntry[] {
    const explicit = getCombinedForGroup(getGroupKey(g))
    return explicit.length > 0 ? explicit : getPrefetchedCombinedEntries(g)
  }

  // ResultCard 내부의 버튼/링크는 전부 자체적으로 stopPropagation()을 호출하므로(RouteBadge,
  // 도보경로 아이콘, 접힘 트리거), 여기서는 이벤트를 안 받아도 카드 배경 클릭만 잡힌다.
  function onGroupCardClick(groupKey: string) {
    setShowAllGroupsTimetable(false)
    setShowGroupList(false)
    setExpandedGroupKey(groupKey)
    const grp = (result && result.groups ? result.groups : []).find((gg) => getGroupKey(gg) === groupKey)
    if (grp) {
      focusSelectedGroupOnMap(grp)
      renderSelectedGroupRouteLines(groupKey, grp).catch(() => {})
    }
  }

  function onToggleGroupTimetable(groupKey: string, g: Group) {
    setExpandedGroupKey(groupKey)
    // In group-list mode, clicking a group's time button should switch to that selected-group view.
    if (showGroupList && !showAllGroupsTimetable) {
      setShowGroupList(false)
      setShowAllGroupsTimetable(false)
    }
    const opened = !!groupTimetables[groupKey] && !groupTimetableHidden[groupKey]
    if (opened) {
      setGroupTimetableHidden((p) => ({ ...p, [groupKey]: true }))
      setTimeout(() => {
        const el = document.querySelector(`[data-group-key="${groupKey}"]`) as HTMLElement | null
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }, 0)
      return
    }
    if (!sday) return
    fetchGroupTimetable(g)
    renderSelectedGroupRouteLines(groupKey, g).catch(() => {})
  }

  function onFoldGroupTimetableAndKeepCardVisible(groupKey: string) {
    setGroupTimetableHidden((p) => ({ ...p, [groupKey]: true }))
    setTimeout(() => {
      const el = document.querySelector(`[data-group-key="${groupKey}"]`) as HTMLElement | null
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }, 0)
  }

  // ─── Share ─────────────────────────────────────────────────────────

  function getDefaultBaseTime(): string {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }

  function normalizeBaseTime(v?: string): string {
    const raw = String(v || '').trim()
    const m = raw.match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return getDefaultBaseTime()
    const h = Number(m[1])
    const mm = Number(m[2])
    if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) {
      return getDefaultBaseTime()
    }
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  function parseBaseTimeMinutes(v: string): number {
    const normalized = normalizeBaseTime(v)
    const m = normalized.match(/^(\d{2}):(\d{2})$/)
    if (!m) return getServiceDayNowMinutes(new Date())
    return Number(m[1]) * 60 + Number(m[2])
  }

  function compactPlaceText(v: string, max = 18): string {
    const txt = String(v || '').replace(/\s+/g, ' ').trim()
    if (!txt) return '-'
    if (txt.length <= max) return txt
    return txt.slice(0, max - 1) + '…'
  }

  function collectShareEntries(): TimetableEntry[] {
    let entries: TimetableEntry[] = []
    if (allGroupsTimetable && allGroupsTimetable.data && allGroupsTimetable.data.combined) {
      entries = allGroupsTimetable.data.combined
    } else {
      for (const k of Object.keys(groupTimetables)) {
        const gt = groupTimetables[k]
        if (!gt || !gt.data) continue
        if (gt.selectedRouteId) {
          const tt = (gt.data.timetables || []).find((x) => String(x.routeId) === String(gt.selectedRouteId))
          if (tt && tt.entries) entries = entries.concat(tt.entries.map((e) => ({ ...e, routeId: tt.routeId, routeName: tt.routeName, routeTypeCd: tt.routeTypeCd })))
        } else {
          entries = entries.concat(gt.data.combined || [])
        }
      }
    }
    return entries
  }

  function buildShareUrl(options: { view?: ShareViewType; baseTime?: string } = {}): string {
    try {
      const params = new URLSearchParams()
      if (ax) params.set('ax', ax)
      if (ay) params.set('ay', ay)
      if (bx) params.set('bx', bx)
      if (by) params.set('by', by)
      if (startRadius) params.set('aradius', startRadius)
      if (endRadius) params.set('bradius', endRadius)
      if (sday) params.set('sday', sday)
      if (startKeyword) params.set('sk', startKeyword)
      if (endKeyword) params.set('ek', endKeyword)
      if (options.view) params.set('view', options.view)
      const bt = normalizeBaseTime(options.baseTime || shareBaseTime)
      if (bt) params.set('base_time', bt)
      const configuredBase = (process.env && process.env.NEXT_PUBLIC_SHARE_BASE_URL) || ''
      const runtimeBase = typeof window !== 'undefined'
        ? window.location.origin + window.location.pathname : ''
      const base = String(configuredBase || runtimeBase).trim()
      const qs = params.toString()
      return qs ? `${base}?${qs}` : base
    } catch {
      return ''
    }
  }

  async function handleShare() {
    const clickedBaseTime = getDefaultBaseTime()
    setShareBaseTime(clickedBaseTime)
    // If we already have prefetched all-groups data, build preview immediately.
    if (allGroupsTimetable && allGroupsTimetable.data) {
      const payload = buildSharePayload(clickedBaseTime)
      if (!payload) { toast.error('공유 가능한 내용을 생성할 수 없습니다.'); return }
      setSharePreviewText(payload.text)
      setSharePreviewTitle(payload.title)
      setSharePreviewLoading(false)
      setSharePreviewOpen(true)
      return
    }

    // Otherwise, trigger prefetch and show loading modal until ready.
    setSharePreviewOpen(true)
    setSharePreviewText('')
    setSharePreviewTitle('공유 내용을 준비 중...')
    setSharePreviewLoading(true)
    try {
      await prefetchAllGroupsTimetable()
      const payload = buildSharePayload(clickedBaseTime)
      if (!payload) {
        setSharePreviewText('공유 가능한 내용을 생성할 수 없습니다.')
        setSharePreviewTitle('공유 불가')
      } else {
        setSharePreviewText(payload.text)
        setSharePreviewTitle(payload.title)
      }
    } catch (err) {
      setSharePreviewText('공유할 내용을 가져오지 못했습니다.')
      setSharePreviewTitle('오류')
    } finally {
      setSharePreviewLoading(false)
    }
  }

  async function ensureKakaoSdk(): Promise<any> {
    if (typeof window === 'undefined') throw new Error('window unavailable')
    const jsKey = (process.env && process.env.NEXT_PUBLIC_KAKAO_JS_KEY) || ''
    if (!jsKey) throw new Error('NEXT_PUBLIC_KAKAO_JS_KEY missing')

    const init = () => {
      const Kakao = (window as any).Kakao
      if (!Kakao) return null
      if (typeof Kakao.isInitialized === 'function' && !Kakao.isInitialized()) Kakao.init(jsKey)
      return Kakao
    }

    const already = init()
    if (already) return already

    await new Promise<void>((resolve, reject) => {
      const scriptId = 'kakao-js-sdk'
      const existing = document.getElementById(scriptId) as HTMLScriptElement | null
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('kakao sdk load failed')), { once: true })
        return
      }
      const script = document.createElement('script')
      script.id = scriptId
      script.async = true
      script.src = 'https://developers.kakao.com/sdk/js/kakao.min.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('kakao sdk load failed'))
      document.head.appendChild(script)
    })

    const loaded = init()
    if (!loaded) throw new Error('Kakao global not found')
    return loaded
  }

  async function handleKakaoShare() {
    try {
      const baseTime = normalizeBaseTime(shareBaseTime)
      const payload = buildSharePayload(baseTime)
      if (!payload) {
        toast.error('공유 가능한 내용을 생성할 수 없습니다.')
        return
      }
      const Kakao = await ensureKakaoSdk()
      const resultsUrl = buildShareUrl({ view: 'results', baseTime })
      const allTimetableUrl = buildShareUrl({ view: 'all_timetable', baseTime })
      const toPathWithQuery = (u: string): string => {
        try {
          const parsed = new URL(u)
          return `${parsed.pathname}${parsed.search}` || '/'
        } catch {
          return '/'
        }
      }
      const resultsPath = toPathWithQuery(resultsUrl)
      const allTimetablePath = toPathWithQuery(allTimetableUrl)
      const description = [
        '경기도 버스 시간 이력 조회 서비스입니다.',
        '아래 버튼으로 검색 결과/통합 시간이력으로 바로 이동하세요.',
      ].join('\n')
      const imageUrl = 'https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_small.png'
      const customTemplateId = Number((process.env && process.env.NEXT_PUBLIC_KAKAO_SHARE_TEMPLATE_ID) || 0)

      const sharePayload = {
        objectType: 'feed',
        content: {
          title: payload.title,
          description,
          imageUrl,
          imageWidth: 400,
          imageHeight: 400,
          link: {
            mobileWebUrl: resultsUrl,
            webUrl: resultsUrl,
          },
        },
        buttons: [
          {
            title: '검색 결과 보기',
            link: {
              mobileWebUrl: resultsUrl,
              webUrl: resultsUrl,
            },
          },
          {
            title: '통합 시간이력 보기',
            link: {
              mobileWebUrl: allTimetableUrl,
              webUrl: allTimetableUrl,
            },
          },
        ],
      }

      // 디버깅에 필요한 최소 정보 로그
      try {
        console.info('[kakao-share] urls', { resultsUrl, allTimetableUrl, customTemplateId })
      } catch {
        // ignore
      }

      // 커스텀 템플릿 ID가 설정된 경우 우선 사용
      // template_args 키는 카카오 디벨로퍼스 템플릿 변수명과 동일해야 한다.
      if (customTemplateId > 0 && Kakao.Share && typeof Kakao.Share.sendCustom === 'function') {
        const items = payload.items || []
        const getItem = (idx: number) => items[idx] || { route: '-', time: '-', desc: '-' }
        const i1 = getItem(0)
        const i2 = getItem(1)
        const i3 = getItem(2)
        const i4 = getItem(3)
        const i5 = getItem(4)
        const fallbackDate = new Date()
        const fallbackMm = String(fallbackDate.getMonth() + 1).padStart(2, '0')
        const fallbackDd = String(fallbackDate.getDate()).padStart(2, '0')
        const mmdd = sday && /^\d{4}-\d{2}-\d{2}$/.test(sday)
          ? sday.slice(5).replace('-', '/')
          : `${fallbackMm}/${fallbackDd}`
        const baseLabel = `${mmdd} ${payload.baseTime} 기준 시간 이력`
        const startEnd = payload.startEndLine

        Kakao.Share.sendCustom({
          templateId: customTemplateId,
          templateArgs: {
            // 공통
            TITLE: '"버스탈시간" 되었어요!',
            DESCRIPTION: description,
            RESULTS_URL: resultsUrl,
            ALL_TIMETABLE_URL: allTimetableUrl,
            RESULTS_PATH: resultsPath,
            ALL_TIMETABLE_PATH: allTimetablePath,

            // 리스트형 템플릿용(권장)
            BASE_LABEL: baseLabel,
            START_END: startEnd,
            START_PLACE: startEnd.split('→')[0]?.trim() || '-',
            END_PLACE: startEnd.split('→')[1]?.trim() || '-',

            ITEM1_ROUTE: i1.route,
            ITEM1_TIME: i1.time,
            ITEM1_DESC: i1.desc,
            ITEM2_ROUTE: i2.route,
            ITEM2_TIME: i2.time,
            ITEM2_DESC: i2.desc,
            ITEM3_ROUTE: i3.route,
            ITEM3_TIME: i3.time,
            ITEM3_DESC: i3.desc,
            ITEM4_ROUTE: i4.route,
            ITEM4_TIME: i4.time,
            ITEM4_DESC: i4.desc,
            ITEM5_ROUTE: i5.route,
            ITEM5_TIME: i5.time,
            ITEM5_DESC: i5.desc,

            // 숫자 키 기반 템플릿 호환(예: ROUTE_1/TIME_1)
            ROUTE_1: i1.route,
            TIME_1: i1.time,
            DESC_1: i1.desc,
            ROUTE_2: i2.route,
            TIME_2: i2.time,
            DESC_2: i2.desc,
            ROUTE_3: i3.route,
            TIME_3: i3.time,
            DESC_3: i3.desc,
            ROUTE_4: i4.route,
            TIME_4: i4.time,
            DESC_4: i4.desc,
            ROUTE_5: i5.route,
            TIME_5: i5.time,
            DESC_5: i5.desc,
          },
        })
        setSharePreviewOpen(false)
        return
      }

      // 일부 카카오톡 클라이언트/SDK 조합에서 Share.sendDefault의 버튼 렌더링이 누락되는 사례가 있어
      // Link.sendDefault를 우선 사용하고, 없으면 Share.sendDefault로 fallback 한다.
      if (Kakao.Link && typeof Kakao.Link.sendDefault === 'function') {
        Kakao.Link.sendDefault(sharePayload)
      } else {
        Kakao.Share.sendDefault(sharePayload)
      }
      setSharePreviewOpen(false)
    } catch {
      toast.error('카카오톡 공유에 실패했습니다. 환경변수와 도메인 등록을 확인하세요.')
    }
  }

  // Build share payload (title, text, url)
  function buildSharePayload(baseTimeInput?: string): SharePayload | null {
    const baseTime = normalizeBaseTime(baseTimeInput || shareBaseTime)
    const url = buildShareUrl({ view: 'results', baseTime })
    if (!url) return null

    const entries = collectShareEntries()

    const baseMinutes = parseBaseTimeMinutes(baseTime)
    const withMinutes = entries.map((e) => ({ e, mins: getDisplayMinutes(e.boardTime) }))
    const upcoming = withMinutes.filter((x) => x.mins != null && x.mins >= baseMinutes).sort((a, b) => (a.mins! - b.mins!)).map((x) => x.e)
    const fallbackSorted = withMinutes.filter((x) => x.mins != null).sort((a, b) => (a.mins! - b.mins!)).map((x) => x.e)
    const chosen = (upcoming.length > 0 ? upcoming : fallbackSorted).slice(0, 5)

    const title = '버스탈시간 검색 결과'
    const startShort = compactPlaceText((startKeyword || (ax && ay ? `${ay}, ${ax}` : '-') || '-').trim(), 22)
    const endShort = compactPlaceText((endKeyword || (bx && by ? `${by}, ${bx}` : '-') || '-').trim(), 22)
    const startEndLine = `${startShort} → ${endShort}`
    const header: string[] = []
    header.push(title)
    if (sday) header.push(`날짜: ${sday}`)
    header.push(`출발→도착: ${startEndLine}`)
    header.push(`기준시간: ${baseTime} 이후 5회`)
    header.push('')

    const lines: string[] = []
    const summaryLines: string[] = []
    const items: Array<{ route: string; time: string; desc: string }> = []
    if (chosen.length === 0) {
      lines.push('예상 탑승 시간 정보가 없습니다.')
      summaryLines.push('예상 탑승 시간 정보가 없습니다.')
      items.push({ route: '-', time: '-', desc: '시간 이력 없음' })
    } else {
      for (const it of chosen) {
        const route = String(it.routeName || it.routeId || '-')
        const board = formatDisplayTime(it.boardTime, sday)
        const alight = formatDisplayTime(it.alightTime, sday)
        const dur = formatDuration(it.boardTime, it.alightTime)
        const boardStation = it.boardStationName || ''
        const alightStation = it.alightStationName || ''
        const stationPart = boardStation || alightStation ? ` (${boardStation || '-'} → ${alightStation || '-'})` : ''
        const row = `· ${route}${stationPart} — 탑승 ${board} / 하차 ${alight} (소요 ${dur})`
        lines.push(row)
        summaryLines.push(`${route} ${board}~${alight}`)
        let durationMinuteText = '-'
        const durMatch = String(dur).match(/^(\d{2}):(\d{2})$/)
        if (durMatch) {
          const totalMinutes = Number(durMatch[1]) * 60 + Number(durMatch[2])
          durationMinuteText = `${totalMinutes}분`
        }
        items.push({
          route,
          time: `탑승${board} 하차${alight}\t(${durationMinuteText})`,
          desc: `${dur}${stationPart ? ' ' + stationPart : ''}`,
        })
      }
    }

    const text = header.concat(lines).concat(['', url]).join('\n')
    while (items.length < 5) items.push({ route: '-', time: '-', desc: '-' })
    return { title, text, url, summaryLines, startEndLine, baseTime, items }
  }

  const [sharePreviewOpen, setSharePreviewOpen] = useState(false)
  const [sharePreviewText, setSharePreviewText] = useState('')
  const [sharePreviewTitle, setSharePreviewTitle] = useState('')
  const [sharePreviewLoading, setSharePreviewLoading] = useState(false)
  const [shareBaseTime, setShareBaseTime] = useState('')
  const pendingLandingViewRef = useRef<ShareViewType | ''>('')

  // PWA install
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null)
  const [showIosInstallTip, setShowIosInstallTip] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  // ─── Effects ───────────────────────────────────────────────────────

  useEffect(() => {
    const bounds = getDateBounds()
    setDateBounds(bounds)
    setSday((prev) => {
      if (prev) return clampDateValue(prev, bounds.min, bounds.max)
      // 기본 기준일 = 지난주 같은 요일(사용자 결정, plans/ui-ux/artifacts/PREVIEW-RESEARCH-COMPARISON.md
      // "최종 결정" 절 참고). 평일/주말 배차 패턴이 다르므로 "어제"보다 대표성이 높다.
      return getDefaultSday()
    })
  }, [])

  // Prefetch all-groups timetable when search `result` arrives so sharing is faster
  useEffect(() => {
    if (!result) return
    if (allGroupsTimetable && (allGroupsTimetable.data || allGroupsTimetable.loading)) return
    prefetchAllGroupsTimetable().catch(() => {})
  }, [result])

  useEffect(() => {
    const pendingView = pendingLandingViewRef.current
    if (!pendingView) return
    if (!result || result.loading || result.error) return
    pendingLandingViewRef.current = ''
    if (pendingView === 'all_timetable') {
      fetchAllGroupsTimetableAndFocus().catch(() => {})
      return
    }
    setShowGroupList(true)
    setShowAllGroupsTimetable(false)
  }, [result])

  useEffect(() => {
    if (!mapRef.current) return
    updateMarker('start', ax, ay)
    updateMarker('end', bx, by)
    updateCircle('start', ax, ay, startRadius)
    updateCircle('end', bx, by, endRadius)
  }, [ax, ay, bx, by, startRadius, endRadius, mapReadyTick])

  useEffect(() => {
    if (!mapRef.current) return
    if (!result || result.loading || result.error) { clearGroupStationOverlays(); return }
    if (!expandedGroupKey) { renderGroupStationOverlays(result.groups || []); return }
    const selected = (result.groups || []).find((g) => getGroupKey(g) === expandedGroupKey)
    if (!selected) { renderGroupStationOverlays(result.groups || []); return }
    renderGroupStationOverlays([selected])
  }, [result, expandedGroupKey, stationNumberMaps])

  useEffect(() => {
    if (!mapRef.current) return
    if (!result || result.loading || result.error || !expandedGroupKey) {
      clearBusRoutePolylines()
      return
    }
    const selected = (result.groups || []).find((g) => getGroupKey(g) === expandedGroupKey)
    if (!selected) {
      clearBusRoutePolylines()
      return
    }
    renderSelectedGroupRouteLines(expandedGroupKey, selected).catch(() => {})
  }, [result, expandedGroupKey, groupTimetables, allGroupsTimetable, sday])

  useEffect(() => {
    if (!mapRef.current) return
    if (!result || result.loading || result.error || !expandedGroupKey) {
      clearAccessLines()
      return
    }
    const selected = (result.groups || []).find((g) => getGroupKey(g) === expandedGroupKey)
    if (!selected) {
      clearAccessLines()
      return
    }
    renderAccessLines(selected)
  }, [result, expandedGroupKey, ax, ay, bx, by])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const appKey = (process.env && process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY) || ''
    if (!appKey) { setMapError('NEXT_PUBLIC_KAKAO_MAP_API_KEY 환경변수를 설정하세요.'); return }

    const initMap = () => {
      const kakao = (window as any).kakao
      if (!kakao || !kakao.maps || !mapContainerRef.current) return
      kakao.maps.load(() => {
        const ayNum = parseCoordValue(ay)
        const axNum = parseCoordValue(ax)
        const center = new kakao.maps.LatLng(
          Number.isNaN(ayNum) ? defaultMapCenter.lat : ayNum,
          Number.isNaN(axNum) ? defaultMapCenter.lon : axNum,
        )
        const map = new kakao.maps.Map(mapContainerRef.current, { center, level: 5 })
        mapRef.current = map
        placesRef.current = new kakao.maps.services.Places()
        geocoderRef.current = new kakao.maps.services.Geocoder()
        updateMarker('start', ax, ay)
        updateMarker('end', bx, by)
        updateCircle('start', ax, ay, startRadius)
        updateCircle('end', bx, by, endRadius)
        if (result && result.groups) {
          if (!expandedGroupKey) {
            renderGroupStationOverlays(result.groups)
          } else {
            const selected = result.groups.find((g) => getGroupKey(g) === expandedGroupKey)
            if (selected) renderGroupStationOverlays([selected])
            else renderGroupStationOverlays(result.groups)
          }
        }
        kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
          const latLng = mouseEvent.latLng
          const point = { lon: toCoordString(latLng.getLng()), lat: toCoordString(latLng.getLat()) }
          const target = mapPickTargetRef.current
          if (target) {
            applyMapPoint(target, point)
            return
          }
          setPendingMapPoint(point)
          setPreSearchPanelOpen(true)
        })
        // Trigger post-init effects so latest URL/query state values are rendered
        setMapReadyTick((v) => v + 1)
      })
    }

    const kakao = (window as any).kakao
    if (kakao && kakao.maps) { initMap(); return }

    const scriptId = 'kakao-map-sdk'
    const existing = document.getElementById(scriptId)
    if (existing) { existing.addEventListener('load', initMap, { once: true }); return }

    const script = document.createElement('script')
    script.id = scriptId
    script.async = true
    script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey=' + appKey
    script.onload = initMap
    script.onerror = () => setMapError('카카오 지도 SDK를 불러오지 못했습니다.')
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 480)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!allGroupsTimetable || allGroupsTimetable.loading || allGroupsTimetable.error) {
      setAllGroupsHighlightedRowIndex(-1)
      return
    }
    moveAllGroupsToCurrentTime()
  }, [allGroupsTimetable, sday])

  useEffect(() => {
    if (!expandedGroupKey) return
    moveGroupToCurrentTime(expandedGroupKey)
  }, [groupTimetables, expandedGroupKey, sday])

  useEffect(() => {
    if (!result || result.loading) return
    const t = setTimeout(() => {
      const node = resultsSectionRef.current
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 60)
    return () => clearTimeout(t)
  }, [result])

  // After search result is ready (including URL-initialized search), fit map to start/end.
  useEffect(() => {
    if (!mapRef.current) return
    if (!result || result.loading || result.error) return
    if (expandedGroupKey) return
    focusStartEndOnMap()
  }, [result, expandedGroupKey, mapReadyTick, ax, ay, bx, by])

  useEffect(() => {
    if (mobileMainView !== 'map') return
    const kakao = (window as any).kakao
    if (!mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    const t = setTimeout(() => {
      try {
        if (typeof mapRef.current.relayout === 'function') mapRef.current.relayout()
        kakao.maps.event.trigger(mapRef.current, 'resize')
        if (expandedGroupKey && result && result.groups) {
          const selected = result.groups.find((g) => getGroupKey(g) === expandedGroupKey)
          if (selected) {
            focusSelectedGroupOnMap(selected)
            return
          }
        }
        focusStartEndOnMap()
      } catch {
        // ignore map resize/focus errors
      }
    }, 120)
    return () => clearTimeout(t)
  }, [mobileMainView, expandedGroupKey, result, mapReadyTick, ax, ay, bx, by])

  // Mobile focused-card mode shows map while results tab is active.
  // Ensure relayout/focus runs when this mode is entered for the first time.
  useEffect(() => {
    const isFocusedCardOnly = !!expandedGroupKey && !showGroupList && !showAllGroupsTimetable
    if (!isFocusedCardOnly) return
    const kakao = (window as any).kakao
    if (!mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    const t = setTimeout(() => {
      try {
        if (typeof mapRef.current.relayout === 'function') mapRef.current.relayout()
        kakao.maps.event.trigger(mapRef.current, 'resize')
        if (expandedGroupKey && result && result.groups) {
          const selected = result.groups.find((g) => getGroupKey(g) === expandedGroupKey)
          if (selected) {
            focusSelectedGroupOnMap(selected)
            return
          }
        }
        focusStartEndOnMap()
      } catch {
        // ignore map resize/focus errors
      }
    }, 120)
    return () => clearTimeout(t)
  }, [expandedGroupKey, showGroupList, showAllGroupsTimetable, result, mapReadyTick, ax, ay, bx, by])

  // PWA install prompt (Android) + iOS detection
  useEffect(() => {
    if (typeof window === 'undefined') return
    const ua = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
    setIsIos(ios)
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    )
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener)
  }, [])

  async function handleInstallPwa() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt()
      const { outcome } = await deferredInstallPrompt.userChoice
      if (outcome === 'accepted') setDeferredInstallPrompt(null)
    } else if (isIos) {
      setShowIosInstallTip((p) => !p)
    }
  }

  // Parse URL query params on first load
  useEffect(() => {
    if (typeof window === 'undefined') return
    const qs = window.location.search
    if (!qs) return
    try {
      const params = new URLSearchParams(qs)
      const qAx = params.get('ax') || ''
      const qAy = params.get('ay') || ''
      const qBx = params.get('bx') || ''
      const qBy = params.get('by') || ''
      const qar = params.get('aradius') || params.get('sr') || ''
      const qbr = params.get('bradius') || params.get('er') || ''
      const qsday = params.get('sday') || params.get('d') || ''
      const qsk = params.get('sk') || ''
      const qek = params.get('ek') || ''
      const qview = params.get('view') || ''
      const qBaseTime = params.get('base_time') || ''

      if (qview === 'results' || qview === 'all_timetable') {
        pendingLandingViewRef.current = qview as ShareViewType
      }
      if (qBaseTime) setShareBaseTime(normalizeBaseTime(qBaseTime))

      let needSearch = false
      if (qAx) { setAx(qAx); needSearch = true }
      if (qAy) { setAy(qAy); needSearch = true }
      if (qBx) { setBx(qBx); needSearch = true }
      if (qBy) { setBy(qBy); needSearch = true }
      if (qar) setStartRadius(qar)
      if (qbr) setEndRadius(qbr)
      if (qsday) setSday(qsday)
      if (qsk) setStartKeyword(qsk)
      if (qek) setEndKeyword(qek)

      if (needSearch) {
        setResult({ loading: true })
        const opts = {
          ax: qAx, ay: qAy, bx: qBx, by: qBy,
          aradius: qar || startRadius, bradius: qbr || endRadius, sday: qsday,
          startLabel: qsk,
          endLabel: qek,
        }
        setTimeout(() => { doSearch(opts).catch((err) => console.error('[deep-link] 자동 검색 실패:', err instanceof Error ? err.message : err)) }, 50)
      }
    } catch (err) {
      console.warn('[deep-link] URL 파라미터 파싱 실패:', err instanceof Error ? err.message : err)
    }
  }, [])

  // ─── Derived values ────────────────────────────────────────────────

  const showStartSearchPanel = startSearchOpened
  const showEndSearchPanel = endSearchOpened
  const showSearchPanels = showStartSearchPanel || showEndSearchPanel
  const focusedCardOnly = !!expandedGroupKey && !showGroupList && !showAllGroupsTimetable
  const hasSearchResult = !!result && !result.loading && !result.error
  const hasAnyResultState = result != null
  // P6-T1: 검색 전이거나, 모바일에서 "지도/검색" 탭을 보고 있을 때는 지도 전체화면+하단
  // 플로팅 패널 스타일(P5-T2)을 쓴다. 데스크톱은 탭 전환이 없어서(mobileMainView가 안 바뀜)
  // 검색 후엔 항상 false로 유지되고 기존 카드형 레이아웃 그대로 나온다.
  const isMapFirstMode = !hasAnyResultState || (mobileMainView === 'map' && !focusedCardOnly)

  // 헤더 + (있다면) 모바일 탭 바까지 합친 실제 높이를 재서 지도 영역의 top 값으로 쓴다.
  // 탭 바는 hasAnyResultState일 때만 렌더되고 데스크톱(md 이상)에서는 md:hidden으로 숨는다.
  useEffect(() => {
    function updateHeaderHeight() {
      const header = document.getElementById('app-header')
      const tabBar = document.getElementById('mobile-view-tabs')
      const headerBottom = header ? header.getBoundingClientRect().bottom : 0
      const tabBarBottom = tabBar && tabBar.offsetParent !== null ? tabBar.getBoundingClientRect().bottom : 0
      setAppHeaderHeight(Math.max(headerBottom, tabBarBottom))
    }
    updateHeaderHeight()
    window.addEventListener('resize', updateHeaderHeight)
    return () => window.removeEventListener('resize', updateHeaderHeight)
  }, [hasAnyResultState, mobileMainView])

  // 검색 전 ↔ 검색 후 전환 시 지도 컨테이너 크기가 크게 바뀐다(화면 전체 ↔ 360px 카드).
  // 카카오 지도는 컨테이너 크기가 바뀌면 relayout()을 호출해줘야 타일이 깨지지 않는다.
  // hasAnyResultState가 이 줄 위에서 막 선언됐으므로 여기서는 안전하게 참조할 수 있다.
  useEffect(() => {
    const kakao = (window as any).kakao
    if (!mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    const t = setTimeout(() => {
      try {
        if (typeof mapRef.current.relayout === 'function') mapRef.current.relayout()
        kakao.maps.event.trigger(mapRef.current, 'resize')
        focusStartEndOnMap()
      } catch {
        // ignore map resize errors
      }
    }, 200)
    return () => clearTimeout(t)
  }, [hasAnyResultState])

  const headerStartText = searchedHeaderStart
  const headerEndText = searchedHeaderEnd
  // B5: 검색 직후 백그라운드로 자동 프리페치되는 allGroupsTimetable은 전체화면을 막지 않는다.
  // 사용자가 "모든 결과 통합 시간이력"을 명시적으로 열었을 때(showAllGroupsTimetable)만 블로킹한다.
  const uiBlockingLoading = !!(result && result.loading) || !!(showAllGroupsTimetable && allGroupsTimetable && allGroupsTimetable.loading)

  // 카드 정렬 — 도착(하차+도보) 시각 기준, 자정 넘김(+1440분) 정규화. 구 `ResultsSection.tsx`의
  // `getBestArrivalScoreMinutes`를 그대로 옮겼다.
  function getBestArrivalScoreMinutes(g: Group): number {
    const sourceEntries = getEffectiveCombinedForGroup(g)
    if (!sourceEntries.length) return Number.POSITIVE_INFINITY
    const walkStartMin = Math.max(0, Math.round(Number(g.walk?.startToBoard?.timeSec || 0) / 60))
    const walkEndMin = Math.max(0, Math.round(Number(g.walk?.alightToEnd?.timeSec || 0) / 60))
    const earliestBoard = getServiceDayNowMinutes(new Date()) + walkStartMin

    const candidates = sourceEntries
      .map((entry) => {
        const boardText = formatDisplayTime(entry.boardTime, sday)
        const alightText = formatDisplayTime(entry.alightTime, sday)
        const bm = String(boardText).match(/^(\d+):(\d{2})$/)
        const am = String(alightText).match(/^(\d+):(\d{2})$/)
        if (!bm || !am) return null
        const boardMin = Number(bm[1]) * 60 + Number(bm[2])
        const alightMin = Number(am[1]) * 60 + Number(am[2])
        if (alightMin < boardMin) return null
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
      return arrival
    })
    return Math.min(...normalized)
  }

  const sortedGroups = useMemo(() => {
    const groups = result?.groups || []
    return groups
      .map((g, originalIdx) => ({ g, originalIdx, score: getBestArrivalScoreMinutes(g) }))
      .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.originalIdx - b.originalIdx))
      .map((item, sortedIdx) => ({ ...item, sortedIdx }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, groupTimetables, allGroupsTimetable, sday])

  const visibleGroups = focusedCardOnly
    ? sortedGroups.filter(({ g }) => getGroupKey(g) === expandedGroupKey)
    : sortedGroups

  // P5-T2/P6-T1: 검색 전이거나 모바일에서 지도/검색 탭을 볼 때(isMapFirstMode)에 따라
  // 지도·검색폼 영역의 className이 크게 달라진다. JSX 안에서 삼항 연산자를 여러 겹 쓰면
  // 실수하기 쉬워서, 미리 변수로 계산해둔다.
  const mapSectionClassName = !isMapFirstMode
    ? `mb-3 w-full space-y-3 ${(mobileMainView === 'results' && !focusedCardOnly) ? 'hidden md:block' : ''}`
    : 'fixed inset-x-0 bottom-0 z-0 overflow-hidden bg-muted'
  const mapSectionStyle = !isMapFirstMode ? undefined : { top: appHeaderHeight }
  const searchPanelOuterClassName = !isMapFirstMode
    ? ''
    : 'safe-area-bottom absolute inset-x-0 bottom-0 z-10 sm:flex sm:justify-center sm:p-4'
  const searchPanelInnerClassName = !isMapFirstMode
    ? 'rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-5'
    : 'w-full rounded-t-3xl border border-border bg-card p-4 shadow-2xl sm:max-w-[480px] sm:rounded-3xl'
  const mapCardOuterClassName = !isMapFirstMode
    ? 'overflow-hidden rounded-2xl border border-border bg-card shadow-sm'
    : 'absolute inset-0 -z-10'
  const mapDivClassName = !isMapFirstMode ? 'w-full' : 'h-full w-full'
  const mapDivStyle = !isMapFirstMode ? { height: 360 } : undefined

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="font-sans text-slate-900">
      <Head>
        <title>버스탈시간-경기도 버스 시간 이력 조회 서비스</title>
      </Head>

      <div id="app-header" className="sticky top-0 z-10 w-full bg-white border-b border-slate-200">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-2 flex items-start justify-between">
          <div>
            {/* P4-T5 최종검증에서 발견: CJK 헤더가 단어 중간에서 줄바꿈되는 문제(Phase 2에서
                이미 발견해 P2-TYPO-BREAKAGE.md에 기록해뒀으나 Phase 3/4 어디서도 실제로 고치지
                않고 있었다). break-keep + 좁은 화면에서는 세로로 쌓기로 수정 */}
            <div className={hasSearchResult ? 'flex flex-col gap-0.5 sm:flex-row sm:items-end sm:gap-2' : ''}>
              <h1 className="break-keep text-xl font-bold">버스탈시간</h1>
              <h3 className="break-keep text-m font-semibold">경기도 버스 시간 이력 조회 서비스</h3>
            </div>
            {hasSearchResult && (headerStartText || headerEndText) && (
              <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-slate-600 sm:text-sm">
                {headerStartText || '-'}
                <span className="mx-1 text-slate-400">→</span>
                {headerEndText || '-'}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
          {hasSearchResult && (
            <button type="button" onClick={handleShare} title="검색 결과 공유" aria-label="검색 결과 공유" className="btn-ui h-8 px-3">
              공유
            </button>
          )}
          {!isStandalone && (deferredInstallPrompt || isIos) && (
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={handleInstallPwa}
                className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                title="홈화면에 추가"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                  <line x1="12" y1="18" x2="12" y2="18.01"/>
                  <line x1="12" y1="7" x2="12" y2="13"/>
                  <polyline points="9 10 12 7 15 10"/>
                </svg>
                <span className="hidden sm:inline">홈화면 추가</span>
              </button>
              {isIos && showIosInstallTip && (
                <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-xs text-slate-700">
                  <div className="font-semibold mb-1.5">홈화면에 추가하는 방법 (iOS)</div>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>브라우저 앱의 공유 버튼을 누르세요</li>
                    <li><strong>홈 화면에 추가</strong>를 선택하세요</li>
                    <li><strong>추가</strong>를 탭하면 완료!</li>
                  </ol>
                  <button
                    type="button"
                    onClick={() => setShowIosInstallTip(false)}
                    className="mt-2 text-blue-600 underline"
                  >
                    닫기
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
      <div className="p-2 sm:p-2.5 !pt-0">
      <div className="mx-auto w-full max-w-[1200px]">

      {/* Map section — P5-T2: 검색 전엔 지도가 화면을 채우고 검색폼이 하단에 뜨는 형태,
          검색 후엔 P4-T7의 카드형 레이아웃 그대로. mapContainerRef의 div는 이 블록 안에서
          항상 같은 자리(마지막 자식)에 있다 — className/style만 조건부로 바뀐다. 절대로
          이 블록을 검색 전/후 두 개의 서로 다른 JSX로 나누지 말 것(지도 리마운트로 파괴됨). */}
      <div className={mapSectionClassName} style={mapSectionStyle}>
        {/* 지도/검색 탭에서 지도 위에 떠 있는 안내 배너 */}
        {isMapFirstMode && (
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 p-3 sm:p-4">
            <div className="pointer-events-auto relative z-10 mx-auto max-w-[480px] rounded-2xl border border-badge-realtime-border bg-badge-realtime-bg/95 p-3 text-badge-realtime-fg shadow-lg backdrop-blur-sm">
              <p className="text-xs font-bold leading-5">
                출발지·도착지를 검색하거나 지도에서 직접 선택해 버스 경로를 찾아보세요
              </p>
            </div>
          </div>
        )}

        {!focusedCardOnly && (
          <div className={searchPanelOuterClassName}>
            <div className={searchPanelInnerClassName}>
              {isMapFirstMode && (
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" aria-hidden="true" />
              )}
              {!isMapFirstMode && (
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-primary">검색 조건</p>
                    <h1 className="mt-1 text-lg font-bold tracking-tight sm:text-xl">출발지와 도착지를 정해 버스를 찾아보세요</h1>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">검색 또는 지도 핀</span>
                </div>
              )}

              <div className="space-y-3">
                {/* Step 1: 출발/도착 입력 — 검색 전/후 항상 노출 */}
                <div className={!isMapFirstMode ? 'rounded-xl border border-border bg-background p-3 sm:p-4' : ''}>
                  {!isMapFirstMode && (
                    <div className="mb-3 flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">1</span>
                      <div>
                        <h2 className="text-sm font-bold text-foreground sm:text-base">출발·도착 입력</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">장소 이름이나 주소를 검색하세요.</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-stretch gap-2">
                    <button
                      className="w-10 shrink-0 self-stretch rounded-lg border border-border text-lg hover:bg-accent"
                      type="button"
                      onClick={swapStartEndPoints}
                      aria-label="출발지와 도착지 교체"
                      title="출발지와 도착지 교체"
                    >
                      ⇅
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <PlaceSearchInput
                        value={startKeyword}
                        onChange={setStartKeyword}
                        onSearch={() => searchPlace('start')}
                        onKeyDown={(e) => handlePlaceKeywordKeyDown(e, 'start')}
                        onLocate={() => getCurrentLocationAndSet('start')}
                        locating={locatingStart}
                        placeholder="출발지/주소 검색"
                      />
                      <PlaceSearchInput
                        value={endKeyword}
                        onChange={setEndKeyword}
                        onSearch={() => searchPlace('end')}
                        onKeyDown={(e) => handlePlaceKeywordKeyDown(e, 'end')}
                        onLocate={() => getCurrentLocationAndSet('end')}
                        locating={locatingEnd}
                        placeholder="도착지/주소 검색"
                      />
                    </div>
                  </div>
                </div>

                {/* Search result panels — 그대로 */}
                {showSearchPanels && (
                  <div className="w-full grid grid-cols-1 gap-3">
                    {showStartSearchPanel && (
                      <SearchResultsPanel
                        title="출발지 검색결과"
                        message={startSearchMsg}
                        results={startSearchResults}
                        onSelect={(p) => selectPlace('start', p)}
                      />
                    )}
                    {showEndSearchPanel && (
                      <SearchResultsPanel
                        title="도착지 검색결과"
                        message={endSearchMsg}
                        results={endSearchResults}
                        onSelect={(p) => selectPlace('end', p)}
                      />
                    )}
                  </div>
                )}

                {isMapFirstMode && (
                  <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-foreground">지도에서 직접 지정</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">버튼을 누른 뒤 지도에서 해당 지점을 선택하세요.</p>
                      </div>
                      {mapPickTarget && (
                        <button
                          type="button"
                          onClick={cancelMapPointPick}
                          className="touch-target shrink-0 text-xs font-semibold text-muted-foreground underline underline-offset-2"
                        >
                          취소
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-pressed={mapPickTarget === 'start'}
                        onClick={() => beginMapPointPick('start')}
                        className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-bold transition ${mapPickTarget === 'start' ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/30 bg-background text-primary hover:bg-primary/10'}`}
                      >
                        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-origin align-middle" aria-hidden="true" />
                        출발지 선택
                      </button>
                      <button
                        type="button"
                        aria-pressed={mapPickTarget === 'end'}
                        onClick={() => beginMapPointPick('end')}
                        className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-bold transition ${mapPickTarget === 'end' ? 'border-destination bg-destination text-white' : 'border-destination/30 bg-background text-destination hover:bg-destination/10'}`}
                      >
                        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-destination align-middle" aria-hidden="true" />
                        도착지 선택
                      </button>
                    </div>
                    {mapPickTarget && (
                      <p className="mt-2 text-center text-xs font-semibold text-primary" role="status">
                        지도에서 {mapPickTarget === 'start' ? '출발지' : '도착지'}를 눌러주세요.
                      </p>
                    )}
                  </div>
                )}

                {pendingMapPoint && (
                  <PendingMapPointBar
                    point={pendingMapPoint}
                    onSetStart={() => applyPendingMapPoint('start')}
                    onSetEnd={() => applyPendingMapPoint('end')}
                    onClear={() => setPendingMapPoint(null)}
                  />
                )}

                {/* Step 2: 지도에서 직접 조정 — 검색 후엔 항상 펼침, 검색 전엔 접혔다 펼치는 형태 */}
                <Collapsible open={!isMapFirstMode ? true : preSearchPanelOpen} onOpenChange={setPreSearchPanelOpen}>
                  {isMapFirstMode && (
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="touch-target flex min-h-9 w-full items-center justify-center gap-1 text-xs font-semibold text-muted-foreground"
                      >
                        {preSearchPanelOpen ? '반경 설정 접기' : '반경 설정 펼치기'}
                        <span aria-hidden="true" className={`transition-transform ${preSearchPanelOpen ? 'rotate-180' : ''}`}>⌄</span>
                      </button>
                    </CollapsibleTrigger>
                  )}
                  <CollapsibleContent>
                    <div className={!isMapFirstMode ? 'rounded-xl border border-border bg-background p-3 sm:p-4' : 'pt-2'}>
                      {!isMapFirstMode && (
                        <div className="mb-3 flex items-start gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">2</span>
                          <div>
                            <h2 className="text-sm font-bold text-foreground sm:text-base">지도에서 직접 조정</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">핀을 드래그하거나 지도를 눌러 지점과 반경을 확인하세요.</p>
                          </div>
                        </div>
                      )}

                      <MapControls
                        startRadius={startRadius}
                        endRadius={endRadius}
                        onStartRadiusChange={handleStartRadiusChange}
                        onEndRadiusChange={handleEndRadiusChange}
                        onFocusStartEnd={focusStartEndOnMap}
                        onMoveToCurrentLocation={moveMapToCurrentLocation}
                        locatingMap={locatingMap}
                      />

                      {mapError && <div className="mb-2 text-sm text-destructive">{mapError}</div>}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* 지도/검색 탭 전용 검색 버튼 — 검색 후에도 지도 우선 화면에서 경로를 다시 찾을 수 있다 */}
              {isMapFirstMode && (
                <form onSubmit={submit} className="mt-3">
                  <button
                    type="submit"
                    disabled={uiBlockingLoading}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {result?.loading && (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                    경로 찾기
                  </button>
                </form>
              )}

              {/* "재검색" 버튼으로 여기 들어온 경우, 다시 검색하지 않고도 이전 결과로 돌아갈 수
                  있는 길을 남겨둔다(안 그러면 결과 화면으로 돌아갈 방법이 없어짐). */}
              {isMapFirstMode && hasAnyResultState && (
                <button
                  type="button"
                  onClick={() => setMobileMainView('results')}
                  className="touch-target mt-2 flex min-h-9 w-full items-center justify-center text-xs font-semibold text-muted-foreground md:hidden"
                >
                  검색 결과 다시 보기
                </button>
              )}
            </div>
          </div>
        )}

        {/* 지도 카드 — 항상 같은 위치(이 블록의 마지막 자식)에서 렌더링돼야 mapContainerRef에
            연결된 Kakao 지도 인스턴스가 검색 전/후 전환이나 focusedCardOnly 토글 시에도
            리마운트되지 않는다(파괴 방지). className/style만 바뀐다. */}
        <div className={mapCardOuterClassName}>
          <div ref={mapContainerRef} className={mapDivClassName} style={mapDivStyle} />
          {!isMapFirstMode && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:px-4">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-origin" aria-hidden="true" />출발</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-destination" aria-hidden="true" />도착</span>
            </div>
          )}
        </div>
      </div>

      {/* Search form — 날짜는 여기서 안 묻는다(P3-T15 결정). 기본은 지난주 같은 요일이고,
          검색 후 결과/시간이력 화면의 DaySwitcher에서 바꿀 수 있다. 데스크톱 결과 화면에서만
          다시 검색 버튼을 보여준다. */}
      {!focusedCardOnly && hasAnyResultState && (
        <form onSubmit={submit} className="mt-4 hidden w-full justify-end md:flex">
          <button
            type="submit"
            disabled={uiBlockingLoading}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70 sm:w-[180px]"
          >
            {result?.loading && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            검색
          </button>
        </form>
      )}

      {/* Results — P4-T1: 구 ResultsSection/GroupCard/GroupTimetable/AllGroupsTimetable을
          ResultCard/TimetableView/DaySwitcher(components/result/*)로 교체 */}
      {result != null && (
        <div
          ref={resultsSectionRef}
          className={mobileMainView === 'map' ? 'hidden md:block' : ''}
          style={{ scrollMarginTop: appHeaderHeight }}
        >
          {result.loading && <div className="mt-5">검색 중...</div>}
          {result.error && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="text-red-600">{result.error}</span>
              {lastSearchOptsRef.current && (
                <button
                  type="button"
                  onClick={() => {
                    if (lastSearchOptsRef.current) doSearch(lastSearchOptsRef.current)
                  }}
                  className="touch-target rounded border border-slate-300 bg-white px-3 py-1 text-sm font-semibold hover:bg-slate-50"
                >
                  다시 시도
                </button>
              )}
            </div>
          )}
          {hasSearchResult && (
            <div className={`mt-5 ${(showAllGroupsTimetable && !showGroupList) || focusedCardOnly ? 'safe-area-content-bottom' : ''}`}>
              {!focusedCardOnly && (
                <>
                  <div className="mb-3 grid w-full grid-cols-2 rounded-xl border border-border bg-card p-1" aria-label="결과 화면 전환">
                    <button
                      type="button"
                      aria-pressed={!showAllGroupsTimetable}
                      onClick={() => {
                        setShowGroupList(true)
                        setShowAllGroupsTimetable(false)
                        if (expandedGroupKey) setGroupTimetables((p) => {
                          const prev = p[expandedGroupKey]
                          return prev ? { ...p, [expandedGroupKey]: { ...prev, selectedRouteId: null } } : p
                        })
                      }}
                      className={`touch-target min-h-9 rounded-lg px-2 py-1.5 text-xs font-bold transition ${!showAllGroupsTimetable ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      결과 카드
                    </button>
                    <button
                      type="button"
                      aria-pressed={showAllGroupsTimetable}
                      onClick={fetchAllGroupsTimetableAndFocus}
                      disabled={!!allGroupsTimetable?.loading}
                      className={`touch-target min-h-9 rounded-lg px-2 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${showAllGroupsTimetable ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      {!!allGroupsTimetable?.loading && (
                        <svg className="mr-1 inline-block h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      )}
                      통합 시간이력
                    </button>
                  </div>

                  <div className="mb-3">
                    <DaySwitcher value={sday} onChange={handleSdayChange} />
                  </div>
                </>
              )}

              {/* 통합 시간이력 — DaySwitcher와 동일한 기준일 전환 계약을 자체적으로 내장하고 있다 */}
              {showAllGroupsTimetable && (
                allGroupsTimetable?.loading ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm font-semibold text-muted-foreground">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    시간이력을 불러오는 중...
                  </div>
                ) : allGroupsTimetable?.error ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
                    <span className="text-red-600">{allGroupsTimetable.error}</span>
                    <button
                      type="button"
                      onClick={fetchAllGroupsTimetableAndFocus}
                      className="touch-target rounded border border-red-300 bg-white px-3 py-1 text-sm font-semibold text-red-700 hover:bg-red-100"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : (
                  <TimetableView
                    combined={allGroupsTimetable?.data?.combined || []}
                    sday={sday}
                    onChange={handleSdayChange}
                    realtimeByStationId={realtimeByStationId}
                    hideDateBasisControl
                  />
                )
              )}

              {/* 결과 카드 화면에서도 카드별 이력(하차 예상 등)은 백그라운드 프리페치되는
                  allGroupsTimetable에서 채워진다 — 검색 직후나 기준일 변경 직후처럼 그게 아직
                  로딩 중일 때는 카드가 빈 값("-")으로 잠깐 보이므로, 로딩 중임을 알려준다. */}
              {!focusedCardOnly && !showAllGroupsTimetable && !!allGroupsTimetable?.loading && (
                <div className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-3 text-sm font-semibold text-muted-foreground">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  시간이력을 불러오는 중...
                </div>
              )}

              {/* Show group list button when focused single card mode */}
              {focusedCardOnly && (
                <div className="safe-area-bottom fixed bottom-3 left-0 right-0 z-40 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGroupList(true)
                      setShowAllGroupsTimetable(false)
                      if (expandedGroupKey) {
                        setGroupTimetableHidden((p) => ({ ...p, [expandedGroupKey]: true }))
                        setGroupTimetables((p) => {
                          const prev = p[expandedGroupKey]
                          return prev ? { ...p, [expandedGroupKey]: { ...prev, selectedRouteId: null } } : p
                        })
                      }
                    }}
                    className="touch-target rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted"
                  >
                    결과목록보기
                  </button>
                </div>
              )}

              {/* 재검색 플로팅 버튼 — 예전 "지도/검색"·"결과" 탭을 대체한다(P6-T2). 결과 카드
                  목록·통합 시간이력 화면(모바일에서만, 데스크톱은 지도/검색폼이 항상 옆에 보이므로
                  불필요)에서 지도 우선 화면(P5-T2 스타일)으로 돌아가는 유일한 경로 — "결과목록보기"
                  와 대칭되는 위치·스타일의 플로팅 버튼으로 배치한다. */}
              {!focusedCardOnly && !isMapFirstMode && (
                <div className="safe-area-bottom fixed bottom-3 left-0 right-0 z-40 flex justify-center md:hidden">
                  <button
                    type="button"
                    onClick={() => setMobileMainView('map')}
                    className="touch-target rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-muted"
                  >
                    재검색
                  </button>
                </div>
              )}

              {/* Result cards */}
              {showAllGroupsTimetable && !showGroupList ? null : (result.groups || []).length === 0 ? (
                <div>조회에 맞는 경로가 없습니다.</div>
              ) : (
                <div className="space-y-3">
                  {visibleGroups.map(({ g, sortedIdx }) => {
                    const groupKey = getGroupKey(g)
                    return (
                      <ResultCard
                        key={groupKey + '-' + sortedIdx}
                        group={g}
                        index={sortedIdx}
                        sday={sday}
                        combined={getEffectiveCombinedForGroup(g)}
                        realtimeByRouteId={realtimeByGroupKey[groupKey] || {}}
                        stationNumberMaps={stationNumberMaps}
                        selectedRouteId={groupTimetables[groupKey]?.selectedRouteId ?? null}
                        onSelectRoute={(routeId) => handleSelectGroupRoute(groupKey, g, routeId)}
                        onCardClick={() => onGroupCardClick(groupKey)}
                        focused={focusedCardOnly}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {uiBlockingLoading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20" role="status" aria-live="polite" aria-label="로딩 중">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-lg">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            로딩 중...
          </div>
        </div>
      )}

      <SharePreviewModal
        open={sharePreviewOpen}
        title={sharePreviewTitle}
        text={sharePreviewText}
        baseTime={shareBaseTime}
        onBaseTimeChange={(v) => {
          setShareBaseTime(v)
          const payload = buildSharePayload(v)
          if (payload) {
            setSharePreviewText(payload.text)
            setSharePreviewTitle(payload.title)
          }
        }}
        onClose={() => setSharePreviewOpen(false)}
        loading={sharePreviewLoading}
        onKakaoShare={handleKakaoShare}
        onCopy={async () => {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(sharePreviewText)
              toast.success('미리보기 텍스트를 클립보드에 복사했습니다.')
            } else {
              toast.error('이 브라우저에서는 클립보드 복사를 지원하지 않습니다.')
            }
          } catch {
            toast.error('복사에 실패했습니다.')
          }
        }}
        onCopyLink={async () => {
          try {
            const link = buildShareUrl({ view: 'results', baseTime: shareBaseTime })
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(link)
              toast.success('공유 링크를 클립보드에 복사했습니다.')
            } else {
              toast.error('이 브라우저에서는 클립보드 복사를 지원하지 않습니다.')
            }
          } catch {
            toast.error('링크 복사에 실패했습니다.')
          }
        }}
        onShare={async () => {
          try {
            if ((navigator as any).share) {
              await (navigator as any).share({ title: sharePreviewTitle || '버스탈시간 검색 결과', text: sharePreviewText, url: buildShareUrl({ view: 'results', baseTime: shareBaseTime }) })
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(sharePreviewText)
              toast.success('공유 텍스트를 클립보드에 복사했습니다.')
            } else {
              toast.error('이 브라우저에서는 공유·복사를 지원하지 않습니다.')
            }
          } catch {
            toast.error('공유에 실패했습니다.')
          } finally {
            setSharePreviewOpen(false)
          }
        }}
      />

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToPageTop}
          aria-label="상단으로 이동"
          title="상단으로 이동"
          className="btn-ui-icon safe-area-bottom-fab fixed right-4 z-40 shadow-sm sm:right-6"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        </button>
      )}

      {/* Footer */}
      <footer className="mt-6 border-t border-slate-200 pt-3 text-sm text-slate-600">
        <div className="w-full flex flex-col items-center justify-between gap-2 sm:flex-row">
          <div className="text-center sm:text-left">© {new Date().getFullYear()} zzqyu. All rights reserved.</div>
          <a
            href="https://github.com/zzqyu/gg-bus-history"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub 저장소 열기"
            className="inline-flex items-center rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"
          >
            <img src="/github-svgrepo-com.svg" alt="GitHub" width={16} height={16} />
            <span className="hidden ml-1 sm:inline">GitHub</span>
            <span className="sr-only">GitHub repository</span>
          </a>
        </div>
      </footer>

      </div>
      </div>
    </div>
  )
}
