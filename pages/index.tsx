import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'
import {
  SearchResult,
  GroupTimetableState,
  AllGroupsTimetableState,
  PendingMapPoint,
  DateBounds,
  Group,
  KakaoPlace,
  TimetableEntry,
} from '../types'
import { getGroupKey, getGroupRouteBadges } from '../utils/routeUtils'
import { getDateBounds, clampDateValue, getQuickDayValue, formatDisplayTime, formatDuration } from '../utils/timeUtils'
import { toCoordString, parseCoordValue, getPlaceDisplayText } from '../utils/mapUtils'
import PlaceSearchInput from '../components/PlaceSearchInput'
import SearchResultsPanel from '../components/SearchResultsPanel'
import MapControls from '../components/MapControls'
import PendingMapPointBar from '../components/PendingMapPointBar'
import DateSelector from '../components/DateSelector'
import ResultsSection from '../components/ResultsSection'
import SharePreviewModal from '../components/SharePreviewModal'

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
  const [allGroupsSelectedRouteId, setAllGroupsSelectedRouteId] = useState<string | null>(null)
  const [locatingStart, setLocatingStart] = useState(false)
  const [locatingEnd, setLocatingEnd] = useState(false)
  const [locatingMap, setLocatingMap] = useState(false)

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
  const allGroupsTableScrollRef = useRef<HTMLDivElement>(null)
  const groupTableScrollRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const routeBadgeRowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const defaultMapCenter = { lon: 127.053749, lat: 37.289522 }

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

  function renderGroupStationOverlays(groups: Group[]) {
    const kakao = (window as any).kakao
    if (!mapRef.current || typeof window === 'undefined' || !kakao || !kakao.maps) return
    clearGroupStationOverlays()
    const list = groups || []
    const posMap: Record<string, { position: any; label: string }> = {}
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
          posMap[key] = { position: pos, label: '' }
        }
        const bg = p.type === 'board' ? '#2563eb' : '#ef4444'
        const txt = (p.station.stationName || '').trim() || `결과 ${idx + 1} ${p.type === 'board' ? '탑승' : '하차'}`
        if (!posMap[key].label) {
          posMap[key].label = `<div style="background:${bg};color:#fff;padding:1px 6px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap;margin-bottom:1px;line-height:1.2;">${txt}</div>`
        }
      }
    }
    for (const key of Object.keys(posMap)) {
      const item = posMap[key]
      const content = `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);">${item.label || ''}</div>`
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
    setShowGroupList(true)
    setShowAllGroupsTimetable(false)
    setGroupTimetableHidden({})
    setAllGroupsHighlightedRowIndex(-1)
    setGroupHighlightedRowIndexes({})
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
      const fallbackText = `${lat}, ${lon}`
      const addressText = await resolveAddressTextByCoord(lon, lat)
      const keywordText = addressText || fallbackText
      if (type === 'start') {
        setStartPoint(lon, lat)
        setStartKeyword(keywordText)
      } else {
        setEndPoint(lon, lat)
        setEndKeyword(keywordText)
      }
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
    placesRef.current.keywordSearch(keyword.trim(), (data: KakaoPlace[], status: any) => {
      if (status !== kakao.maps.services.Status.OK || !data || data.length === 0) {
        if (type === 'start') { setStartSearchResults([]); setStartSearchMsg('검색 결과가 없습니다.') }
        else { setEndSearchResults([]); setEndSearchMsg('검색 결과가 없습니다.') }
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

  async function doSearch(opts: { ax: string; ay: string; bx: string; by: string; aradius: string; bradius: string; sday: string }) {
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
    setResult(j)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await doSearch({ ax, ay, bx, by, aradius: startRadius, bradius: endRadius, sday })
  }

  async function fetchGroupTimetable(g: Group, routeId: string | null = null) {
    const key = getGroupKey(g)
    setShowAllGroupsTimetable(false)
    setShowGroupList(true)
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
    if (allGroupsTimetable && !allGroupsTimetable.loading) {
      setShowAllGroupsTimetable(true)
      setShowGroupList(false)
      return
    }
    setAllGroupsTimetable({ loading: true })
    setShowAllGroupsTimetable(true)
    setShowGroupList(false)
    try {
      const params = new URLSearchParams({ ax, ay, bx, by, aradius: startRadius, bradius: endRadius })
      if (sday) params.set('sday', sday)
      const r = await fetch('/api/allGroupsTimetable?' + params.toString())
      const j = await r.json()
      setAllGroupsTimetable({ loading: false, data: j })
    } catch (err) {
      setAllGroupsTimetable({ loading: false, error: String(err) })
    }
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
        const params = new URLSearchParams({ ax, ay, bx, by, aradius: startRadius, bradius: endRadius })
        if (sday) params.set('sday', sday)
        const r = await fetch('/api/allGroupsTimetable?' + params.toString())
        const j = await r.json()
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
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
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
    const entries = allGroupsSelectedRouteId
      ? combinedAll.filter((e) => String(e.routeId) === String(allGroupsSelectedRouteId))
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
        }))
      }
      return []
    }
    return gt.data.combined || []
  }

  function onGroupCardClick(e: React.MouseEvent, groupKey: string) {
    const target = e.target as HTMLElement
    if (target && target.closest && target.closest('button, a, input, select, textarea, label')) return
    const willExpand = expandedGroupKey !== groupKey
    setExpandedGroupKey((prev) => (prev === groupKey ? null : groupKey))
    if (willExpand && sday) {
      const grp = (result && result.groups ? result.groups : []).find((gg) => getGroupKey(gg) === groupKey)
      if (grp) fetchGroupTimetable(grp)
    }
  }

  // ─── Share ─────────────────────────────────────────────────────────

  function buildShareUrl(): string {
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
      const base = typeof window !== 'undefined'
        ? window.location.origin + window.location.pathname : ''
      const qs = params.toString()
      return qs ? `${base}?${qs}` : base
    } catch {
      return ''
    }
  }

  async function handleShare() {
    // If we already have prefetched all-groups data, build preview immediately.
    if (allGroupsTimetable && allGroupsTimetable.data) {
      const payload = buildSharePayload()
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
      const payload = buildSharePayload()
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

  // Build share payload (title, text, url)
  function buildSharePayload(): { title: string; text: string; url: string } | null {
    const url = buildShareUrl()
    if (!url) return null

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

    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const withMinutes = entries.map((e) => ({ e, mins: getDisplayMinutes(e.boardTime) }))
    const upcoming = withMinutes.filter((x) => x.mins != null && x.mins >= nowMinutes).sort((a, b) => (a.mins! - b.mins!)).map((x) => x.e)
    const fallbackSorted = withMinutes.filter((x) => x.mins != null).sort((a, b) => (a.mins! - b.mins!)).map((x) => x.e)
    const chosen = (upcoming.length > 0 ? upcoming : fallbackSorted).slice(0, 5)

    const title = '버스탈시간 검색 결과'
    const header: string[] = []
    header.push(title)
    if (sday) header.push(`날짜: ${sday}`)
    if (startKeyword) header.push(`출발: ${startKeyword}`)
    if (endKeyword) header.push(`도착: ${endKeyword}`)
    header.push('')

    const lines: string[] = []
    if (chosen.length === 0) {
      lines.push('예상 탑승 시간 정보가 없습니다.')
    } else {
      for (const it of chosen) {
        const route = String(it.routeName || it.routeId || '-')
        const board = formatDisplayTime(it.boardTime, sday)
        const alight = formatDisplayTime(it.alightTime, sday)
        const dur = formatDuration(it.boardTime, it.alightTime)
        const boardStation = it.boardStationName || ''
        const alightStation = it.alightStationName || ''
        const stationPart = boardStation || alightStation ? ` (${boardStation || '-'} → ${alightStation || '-'})` : ''
        lines.push(`· ${route}${stationPart} — 탑승 ${board} / 하차 ${alight} (소요 ${dur})`)
      }
    }

    const text = header.concat(lines).concat(['', url]).join('\n')
    return { title, text, url }
  }

  const [sharePreviewOpen, setSharePreviewOpen] = useState(false)
  const [sharePreviewText, setSharePreviewText] = useState('')
  const [sharePreviewTitle, setSharePreviewTitle] = useState('')
  const [sharePreviewLoading, setSharePreviewLoading] = useState(false)

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
    if (!mapRef.current) return
    updateMarker('start', ax, ay)
    updateMarker('end', bx, by)
    updateCircle('start', ax, ay, startRadius)
    updateCircle('end', bx, by, endRadius)
  }, [ax, ay, bx, by, startRadius, endRadius])

  useEffect(() => {
    if (!mapRef.current) return
    if (!result || result.loading || result.error) { clearGroupStationOverlays(); return }
    if (!expandedGroupKey) { renderGroupStationOverlays(result.groups || []); return }
    const selected = (result.groups || []).find((g) => getGroupKey(g) === expandedGroupKey)
    if (!selected) { renderGroupStationOverlays(result.groups || []); return }
    renderGroupStationOverlays([selected])
  }, [result, expandedGroupKey])

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

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="p-5 font-sans text-[80%] text-slate-900 sm:text-[100%]">
      <Head>
        <title>버스탈시간-경기도 버스 시간 이력 조회 서비스</title>
      </Head>

      <h1 className="text-2xl font-bold">버스탈시간</h1>
      <h3 className="mb-3 text-lg font-semibold">경기도 버스 시간 이력 조회 서비스</h3>

      {/* Map section */}
      <div className="mb-3 max-w-[900px] rounded-lg border border-slate-300 p-3">
        {/* Place search inputs */}
        <div className="mb-2 flex items-stretch">
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
              placeholder="출발지 검색"
            />
            <PlaceSearchInput
              value={endKeyword}
              onChange={setEndKeyword}
              onSearch={() => searchPlace('end')}
              onKeyDown={(e) => handlePlaceKeywordKeyDown(e, 'end')}
              onLocate={() => getCurrentLocationAndSet('end')}
              locating={locatingEnd}
              placeholder="도착지 검색"
            />
          </div>
        </div>

        {/* Search result panels */}
        {showSearchPanels && (
          <div className="mb-2 grid grid-cols-1 gap-3 md:grid-cols-2">
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

        {/* Kakao map container */}
        <div
          ref={mapContainerRef}
          className="w-full rounded"
          style={{ height: 360, border: '1px solid #ddd' }}
        />
      </div>

      {/* Search form */}
      <form onSubmit={submit} className="grid max-w-[640px] gap-2">
        <DateSelector
          sday={sday}
          dateBounds={dateBounds}
          quickDay1={quickDay1}
          quickDay2={quickDay2}
          quickDay7={quickDay7}
          onSdayChange={handleSdayChange}
          onQuickDay={setQuickDay}
        />
        <div>
          <button
            type="submit"
            className="h-11 w-[180px] rounded bg-slate-900 text-base font-bold text-white hover:bg-slate-700"
          >
            검색
          </button>
        </div>
      </form>

      {/* Results */}
      {result != null && (
        <ResultsSection
          result={result}
          sday={sday}
          groupTimetables={groupTimetables}
          allGroupsTimetable={allGroupsTimetable}
          showAllGroupsTimetable={showAllGroupsTimetable}
          showGroupList={showGroupList}
          groupTimetableHidden={groupTimetableHidden}
          allGroupsHighlightedRowIndex={allGroupsHighlightedRowIndex}
          groupHighlightedRowIndexes={groupHighlightedRowIndexes}
          allGroupsSelectedRouteId={allGroupsSelectedRouteId}
          expandedGroupKey={expandedGroupKey}
          allGroupsTableScrollRef={allGroupsTableScrollRef}
          groupTableScrollRefs={groupTableScrollRefs}
          routeBadgeRowRefs={routeBadgeRowRefs}
          onShare={handleShare}
          onFetchAllGroupsTimetable={fetchAllGroupsTimetable}
          onSelectAllGroupsRoute={setAllGroupsSelectedRouteId}
          onMoveAllGroupsToCurrentTime={moveAllGroupsToCurrentTime}
          onFoldAllGroupsTimetable={() => { setShowAllGroupsTimetable(false); setShowGroupList(true) }}
          onShowGroupList={() => { setShowGroupList(true); setShowAllGroupsTimetable(false) }}
          onGroupCardClick={onGroupCardClick}
          onFetchGroupTimetable={fetchGroupTimetable}
          onSelectGroupRoute={handleSelectGroupRoute}
          onMoveGroupToCurrentTime={moveGroupToCurrentTime}
          onFoldGroupTimetable={(key) => setGroupTimetableHidden((p) => ({ ...p, [key]: true }))}
          getCombinedForGroup={getCombinedForGroup}
        />
      )}

      <SharePreviewModal
        open={sharePreviewOpen}
        title={sharePreviewTitle}
        text={sharePreviewText}
        onClose={() => setSharePreviewOpen(false)}
        loading={sharePreviewLoading}
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
        onShare={async () => {
          try {
            if ((navigator as any).share) {
              await (navigator as any).share({ title: sharePreviewTitle || '버스탈시간 검색 결과', text: sharePreviewText, url: buildShareUrl() })
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
    </div>
  )
}
