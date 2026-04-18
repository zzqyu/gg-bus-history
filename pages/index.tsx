import Head from 'next/head'
import { useEffect, useMemo, useRef, useState } from 'react'
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
} from '../types'
import { getGroupKey, getGroupRouteBadges } from '../utils/routeUtils'
import { getDateBounds, clampDateValue, getQuickDayValue, formatDisplayTime, formatDuration, getServiceDayNowMinutes } from '../utils/timeUtils'
import { toCoordString, parseCoordValue, getPlaceDisplayText } from '../utils/mapUtils'
import PlaceSearchInput from '../components/PlaceSearchInput'
import SearchResultsPanel from '../components/SearchResultsPanel'
import MapControls from '../components/MapControls'
import PendingMapPointBar from '../components/PendingMapPointBar'
import DateSelector from '../components/DateSelector'
import ResultsSection from '../components/ResultsSection'
import SharePreviewModal from '../components/SharePreviewModal'
import Image from 'next/image'
import { buildStationNumberMaps, getAlightStationNumber, getBoardStationNumber } from '../utils/stationNumberUtils'

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
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [searchedHeaderStart, setSearchedHeaderStart] = useState('')
  const [searchedHeaderEnd, setSearchedHeaderEnd] = useState('')

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
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
  const defaultMapCenter = { lon: 127.053749, lat: 37.289522 }

  const stationNumberMaps: StationNumberMaps = useMemo(
    () => buildStationNumberMaps((result && result.groups) || [], allGroupsSelectedRouteIds),
    [result, allGroupsSelectedRouteIds]
  )

  function buildAllGroupsTimetableQueryString(): string {
    const params = new URLSearchParams({ ax, ay, bx, by, aradius: startRadius, bradius: endRadius })
    if (sday) params.set('sday', sday)
    return params.toString()
  }

  async function requestAllGroupsTimetableOnce(): Promise<any> {
    const query = buildAllGroupsTimetableQueryString()
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
    } catch {
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
      alert('이 브라우저는 현재 위치 기능을 지원하지 않습니다.')
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
      alert('현재 위치를 가져오지 못했습니다. 위치 권한을 확인하세요.')
    } finally {
      if (type === 'start') setLocatingStart(false)
      else setLocatingEnd(false)
    }
  }

  async function moveMapToCurrentLocation() {
    if (!navigator.geolocation) {
      alert('이 브라우저는 현재 위치 기능을 지원하지 않습니다.')
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
      alert('현재 위치를 가져오지 못했습니다. 위치 권한을 확인하세요.')
    } finally {
      setLocatingMap(false)
    }
  }

  function handleSdayChange(v: string) {
    setSday(clampDateValue(v, dateBounds.min, dateBounds.max))
    resetTimetableViews({ keepExpandedGroup: true })
  }

  function setQuickDay(daysAgo: number) {
    handleSdayChange(getQuickDayValue(daysAgo, dateBounds))
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

  async function applyPendingMapPoint(type: 'start' | 'end') {
    if (!pendingMapPoint) return
    const { lon, lat } = pendingMapPoint
    const fallbackText = `${toCoordString(lat)}, ${toCoordString(lon)}`
    const addressText = await resolveAddressTextByCoord(lon, lat)
    const keywordText = addressText || fallbackText
    if (type === 'start') {
      setStartPoint(lon, lat)
      setStartKeyword(keywordText)
    } else {
      setEndPoint(lon, lat)
      setEndKeyword(keywordText)
    }
    setPendingMapPoint(null)
    resetTimetableViews()
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
    setResult({ loading: true })
    resetTimetableViews()
    const params = new URLSearchParams({
      ax: opts.ax, ay: opts.ay, bx: opts.bx, by: opts.by,
      aradius: opts.aradius || startRadius, bradius: opts.bradius || endRadius,
    })
    if (opts.sday) params.set('sday', opts.sday)
    const r = await fetch('/api/findRoutes?' + params.toString())
    const j = await r.json()
    setShowAllGroupsTimetable(false)
    setShowGroupList(true)
    setAllGroupsSelectedRouteIds([])
    setResult(j)
    if (j && !j.error) {
      setSearchedHeaderStart(compactHeaderPlaceText((opts.startLabel || `${opts.ay}, ${opts.ax}`).trim()))
      setSearchedHeaderEnd(compactHeaderPlaceText((opts.endLabel || `${opts.by}, ${opts.bx}`).trim()))
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
      setGroupTimetables((p) => ({ ...p, [key]: { loading: false, error: String(err), selectedRouteId: routeId || null } }))
    }
  }

  async function fetchAllGroupsTimetable() {
    // Always reset route filter when the table is opened
    setAllGroupsSelectedRouteIds([])
    // Already have data (or error) → just show it
    if (allGroupsTimetable && !allGroupsTimetable.loading) {
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
      setAllGroupsTimetable({ loading: false, error: String(err) })
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
        setAllGroupsTimetable({ loading: false, error: String(err) })
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

  function onGroupCardClick(e: React.MouseEvent, groupKey: string) {
    const target = e.target as HTMLElement
    if (target && target.closest && target.closest('button, a, input, select, textarea, label')) return
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
      if (!payload) { alert('공유 가능한 내용을 생성할 수 없습니다.'); return }
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
        alert('공유 가능한 내용을 생성할 수 없습니다.')
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
      const jsKeyExists = !!((process.env && process.env.NEXT_PUBLIC_KAKAO_JS_KEY) || '')

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
        console.info('[kakao-share] urls', {
          origin: typeof window !== 'undefined' ? window.location.origin : '',
          resultsUrl,
          allTimetableUrl,
          customTemplateId,
          jsKeyExists,
        })
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
    } catch (err: any) {
      const reason = String(err && err.message ? err.message : err || 'unknown_error')
      try {
        console.error('[kakao-share] failed', {
          reason,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
          customTemplateId: Number((process.env && process.env.NEXT_PUBLIC_KAKAO_SHARE_TEMPLATE_ID) || 0),
          jsKeyExists: !!((process.env && process.env.NEXT_PUBLIC_KAKAO_JS_KEY) || ''),
          shareBaseUrl: (process.env && process.env.NEXT_PUBLIC_SHARE_BASE_URL) || '',
        })
      } catch {
        // ignore
      }
      alert(`카카오톡 공유에 실패했습니다.\n원인: ${reason}\n콘솔의 [kakao-share] 로그를 확인하세요.`)
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
      return bounds.max
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
          setPendingMapPoint({ lon: toCoordString(latLng.getLng()), lat: toCoordString(latLng.getLat()) })
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
        const opts = {
          ax: qAx, ay: qAy, bx: qBx, by: qBy,
          aradius: qar || startRadius, bradius: qbr || endRadius, sday: qsday,
          startLabel: qsk,
          endLabel: qek,
        }
        setTimeout(() => { doSearch(opts).catch(() => {}) }, 50)
      }
    } catch {
      // ignore
    }
  }, [])

  // ─── Derived values ────────────────────────────────────────────────

  const showStartSearchPanel = startSearchOpened
  const showEndSearchPanel = endSearchOpened
  const showSearchPanels = showStartSearchPanel || showEndSearchPanel
  const quickDay1 = getQuickDayValue(1, dateBounds)
  const quickDay2 = getQuickDayValue(2, dateBounds)
  const quickDay7 = getQuickDayValue(7, dateBounds)
  const focusedCardOnly = !!expandedGroupKey && !showGroupList && !showAllGroupsTimetable
  const hasSearchResult = !!result && !result.loading && !result.error
  const hasAnyResultState = result != null
  const headerStartText = searchedHeaderStart
  const headerEndText = searchedHeaderEnd

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="font-sans text-[80%] text-slate-900 sm:text-[100%]">
      <Head>
        <title>버스탈시간-경기도 버스 시간 이력 조회 서비스</title>
      </Head>

      <div className="sticky top-0 z-10 w-full bg-white border-b border-slate-200">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-2 flex items-start justify-between">
          <div>
            <div className={hasSearchResult ? 'flex items-end gap-2' : ''}>
              <h1 className="text-xl font-bold">버스탈시간</h1>
              <h3 className="text-m font-semibold">경기도 버스 시간 이력 조회 서비스</h3>
            </div>
            {hasSearchResult && (headerStartText || headerEndText) && (
              <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-slate-600 sm:text-sm">
                {headerStartText || '-'}
                <span className="mx-1 text-slate-400">→</span>
                {headerEndText || '-'}
              </p>
            )}
          </div>
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
      <div className="p-4 sm:p-5">
      <div className="mx-auto w-full max-w-[1200px]">

      {hasAnyResultState && (
        <div className="mb-3 flex md:hidden">
          <div className="grid w-full grid-cols-2 rounded-lg border border-slate-300 bg-white p-1">
            <button
              type="button"
              onClick={() => {
                setMobileMainView('map')
                if (focusedCardOnly) {
                  setShowGroupList(true)
                  setShowAllGroupsTimetable(false)
                }
              }}
              className="rounded px-2 py-1.5 text-xs font-semibold"
              style={mobileMainView === 'map' ? { background: '#0f172a', color: '#fff' } : { color: '#334155' }}
            >
              지도/검색
            </button>
            <button
              type="button"
              onClick={() => setMobileMainView('results')}
              className="rounded px-2 py-1.5 text-xs font-semibold"
              style={mobileMainView === 'results' ? { background: '#0f172a', color: '#fff' } : { color: '#334155' }}
            >
              결과
            </button>
          </div>
        </div>
      )}

      {/* Map section */}
      <div className={`mb-3 w-full rounded-lg border border-slate-300 p-2 sm:p-3 ${(mobileMainView === 'results' && !focusedCardOnly) ? 'hidden md:block' : ''}`}>
        {!focusedCardOnly && (
          <>
            {/* Place search inputs */}
            <div className="mb-2 p-0 sm:rounded-md sm:border sm:border-slate-200 sm:bg-white sm:p-2">
              <div className="mb-1.5 flex items-center gap-2 sm:mb-2">
                <strong className="text-xs sm:text-sm">출발/도착지 설정</strong>
                <span className="text-[11px] text-slate-600">(검색 또는 지도 핀)</span>
              </div>
              <div className="flex items-stretch">
              <button
                className="w-10 shrink-0 rounded border border-slate-300 text-lg hover:bg-slate-50"
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

            {/* Search result panels */}
            {showSearchPanels && (
              <div className="w-full mb-2 grid grid-cols-1 gap-3">
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

            {/* Map controls */}
            <MapControls
              startRadius={startRadius}
              endRadius={endRadius}
              onStartRadiusChange={handleStartRadiusChange}
              onEndRadiusChange={handleEndRadiusChange}
              onFocusStartEnd={focusStartEndOnMap}
              onMoveToCurrentLocation={moveMapToCurrentLocation}
              locatingMap={locatingMap}
            />

            {/* Pending map point */}
            {pendingMapPoint && (
              <PendingMapPointBar
                point={pendingMapPoint}
                onSetStart={() => applyPendingMapPoint('start')}
                onSetEnd={() => applyPendingMapPoint('end')}
                onClear={() => setPendingMapPoint(null)}
              />
            )}

            {/* Map error */}
            {mapError && <div className="mb-2 text-red-600">{mapError}</div>}
          </>
        )}

        {/* Kakao map container */}
        <div
          ref={mapContainerRef}
          className="w-full rounded"
          style={{ height: 360, border: '1px solid #ddd' }}
        />
      </div>

      {/* Search form */}
      {!focusedCardOnly && (
        <form onSubmit={submit} className="w-full mt-4 px-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1">
              <DateSelector
                sday={sday}
                dateBounds={dateBounds}
                quickDay1={quickDay1}
                quickDay2={quickDay2}
                quickDay7={quickDay7}
                onSdayChange={handleSdayChange}
                onQuickDay={setQuickDay}
              />
            </div>
            <div className="flex justify-end sm:justify-start">
              <button
                type="submit"
                className="h-10 sm:h-11 w-[170px] sm:w-[180px] rounded bg-slate-900 text-sm sm:text-base font-bold text-white hover:bg-slate-700"
              >
                검색
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Results */}
      {result != null && (
        <div ref={resultsSectionRef} className={mobileMainView === 'map' ? 'hidden md:block' : ''}>
          <ResultsSection
            result={result}
            sday={sday}
            stationNumberMaps={stationNumberMaps}
            groupTimetables={groupTimetables}
            allGroupsTimetable={allGroupsTimetable}
            showAllGroupsTimetable={showAllGroupsTimetable}
            showGroupList={showGroupList}
            groupTimetableHidden={groupTimetableHidden}
            allGroupsHighlightedRowIndex={allGroupsHighlightedRowIndex}
            groupHighlightedRowIndexes={groupHighlightedRowIndexes}
            allGroupsSelectedRouteIds={allGroupsSelectedRouteIds}
            expandedGroupKey={expandedGroupKey}
            allGroupsTableScrollRef={allGroupsTableScrollRef}
            groupTableScrollRefs={groupTableScrollRefs}
            routeBadgeRowRefs={routeBadgeRowRefs}
            onShare={handleShare}
            onFetchAllGroupsTimetable={fetchAllGroupsTimetableAndFocus}
            onSelectAllGroupsRoutes={setAllGroupsSelectedRouteIds}
            onMoveAllGroupsToCurrentTime={moveAllGroupsToCurrentTime}
            onFoldAllGroupsTimetable={() => {
              setShowAllGroupsTimetable(false)
              setShowGroupList(true)
              // Reset expanded group filter so it opens as "all" next time
              if (expandedGroupKey) setGroupTimetables((p) => {
                const prev = p[expandedGroupKey]
                return prev ? { ...p, [expandedGroupKey]: { ...prev, selectedRouteId: null } } : p
              })
            }}
            onShowGroupList={() => {
              setShowGroupList(true)
              setShowAllGroupsTimetable(false)
              // Close the currently expanded group timetable when returning to group list.
              if (expandedGroupKey) {
                setGroupTimetableHidden((p) => ({ ...p, [expandedGroupKey]: true }))
              }
              // Reset expanded group filter so it opens as "all" next time
              if (expandedGroupKey) setGroupTimetables((p) => {
                const prev = p[expandedGroupKey]
                return prev ? { ...p, [expandedGroupKey]: { ...prev, selectedRouteId: null } } : p
              })
            }}
            onGroupCardClick={onGroupCardClick}
            onToggleGroupTimetable={onToggleGroupTimetable}
            onFetchGroupTimetable={fetchGroupTimetable}
            onSelectGroupRoute={handleSelectGroupRoute}
            onMoveGroupToCurrentTime={moveGroupToCurrentTime}
            onFoldGroupTimetable={onFoldGroupTimetableAndKeepCardVisible}
            getCombinedForGroup={getCombinedForGroup}
          />
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
              alert('미리보기 텍스트를 클립보드에 복사했습니다.')
            } else {
              prompt('아래 텍스트를 복사하세요:', sharePreviewText)
            }
          } catch {
            alert('복사에 실패했습니다.')
          }
        }}
        onCopyLink={async () => {
          try {
            const link = buildShareUrl({ view: 'results', baseTime: shareBaseTime })
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(link)
              alert('공유 링크를 클립보드에 복사했습니다.')
            } else {
              prompt('아래 링크를 복사하세요:', link)
            }
          } catch {
            alert('링크 복사에 실패했습니다.')
          }
        }}
        onShare={async () => {
          try {
            if ((navigator as any).share) {
              await (navigator as any).share({ title: sharePreviewTitle || '버스탈시간 검색 결과', text: sharePreviewText, url: buildShareUrl({ view: 'results', baseTime: shareBaseTime }) })
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(sharePreviewText)
              alert('공유 텍스트를 클립보드에 복사했습니다.')
            } else {
              prompt('아래 텍스트를 복사하세요:', sharePreviewText)
            }
          } catch {
            alert('공유에 실패했습니다.')
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
          className="btn-ui-icon fixed bottom-5 right-4 z-40 shadow-sm sm:right-6 sm:bottom-6"
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
            <Image src="/github-svgrepo-com.svg" alt="GitHub" width={16} height={16} />
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
