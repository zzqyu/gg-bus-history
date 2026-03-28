import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'

export default function Home() {
  const [ax, setAx] = useState('')
  const [ay, setAy] = useState('')
  const [bx, setBx] = useState('')
  const [by, setBy] = useState('')
  const [startRadius, setStartRadius] = useState('500')
  const [endRadius, setEndRadius] = useState('500')
  const [sday, setSday] = useState('')
  const [dateBounds, setDateBounds] = useState({ min: '', max: '' })
  const [result, setResult] = useState(null)
  const [groupTimetables, setGroupTimetables] = useState({})
  const [allGroupsTimetable, setAllGroupsTimetable] = useState(null)
  const [expandedGroupKey, setExpandedGroupKey] = useState(null)
  const [startKeyword, setStartKeyword] = useState('')
  const [endKeyword, setEndKeyword] = useState('')
  const [startSearchResults, setStartSearchResults] = useState([])
  const [endSearchResults, setEndSearchResults] = useState([])
  const [startSearchMsg, setStartSearchMsg] = useState('')
  const [endSearchMsg, setEndSearchMsg] = useState('')
  const [startSearchOpened, setStartSearchOpened] = useState(false)
  const [endSearchOpened, setEndSearchOpened] = useState(false)
  const [pendingMapPoint, setPendingMapPoint] = useState(null)
  const [mapError, setMapError] = useState('')
  const [showGroupList, setShowGroupList] = useState(true)
  const [showAllGroupsTimetable, setShowAllGroupsTimetable] = useState(false)
  const [groupTimetableHidden, setGroupTimetableHidden] = useState({})
  const [allGroupsHighlightedRowIndex, setAllGroupsHighlightedRowIndex] = useState(-1)
  const [groupHighlightedRowIndexes, setGroupHighlightedRowIndexes] = useState({})
  const [routeBadgeVisibleCounts, setRouteBadgeVisibleCounts] = useState({})
  const [allGroupsSelectedRouteId, setAllGroupsSelectedRouteId] = useState(null)

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const placesRef = useRef(null)
  const geocoderRef = useRef(null)
  const markersRef = useRef({ start: null, end: null })
  const markerImagesRef = useRef({ start: null, end: null })
  const markerLabelsRef = useRef({ start: null, end: null })
  const circlesRef = useRef({ start: null, end: null })
  const groupStationMarkersRef = useRef([])
  const groupStationOverlaysRef = useRef([])
  const allGroupsTableScrollRef = useRef(null)
  const groupTableScrollRefs = useRef({})
  const routeBadgeRowRefs = useRef({})
  const defaultMapCenter = { lon: 127.053749, lat: 37.289522 }

  function compareRoutes(a, b) {
    const na = String((a && (a.routeName || a.routeId)) || '')
    const nb = String((b && (b.routeName || b.routeId)) || '')
    const ma = na.match(/\d+/)
    const mb = nb.match(/\d+/)
    if (ma && mb) {
      const va = Number(ma[0])
      const vb = Number(mb[0])
      if (va !== vb) return va - vb
      return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' })
    }
    if (ma && !mb) return -1
    if (!ma && mb) return 1
    return na.localeCompare(nb, undefined, { sensitivity: 'base' })
  }

  function getGroupKey(g) {
    return g.board.stationId + '-' + g.alight.stationId
  }

  function getGroupRouteBadges(g) {
    const seen = new Set()
    const out = []
    for (const r of (g.routes || [])) {
      const routeId = String(r.routeId || '')
      const routeName = String(r.routeName || r.routeId || '').trim()
      const key = routeId || routeName
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push({ routeId, routeName, routeTypeCd: r.routeTypeCd })
    }
    out.sort(compareRoutes)
    return out
  }

  function estimateBadgeWidth(text) {
    const len = String(text || '').length
    return 28 + len * 8
  }

  function calcVisibleRouteBadgeCount(routeList, containerWidth) {
    if (!routeList || routeList.length === 0) return 0
    if (!containerWidth || containerWidth <= 0) return routeList.length
    const plusBadgeWidth = 44
    let used = 0
    let shown = 0
    for (let i = 0; i < routeList.length; i += 1) {
      const badgeWidth = estimateBadgeWidth(routeList[i].routeName)
      if (used + badgeWidth <= containerWidth) {
        used += badgeWidth
        shown += 1
      } else {
        break
      }
    }
    if (shown >= routeList.length) return shown
    while (shown > 0 && used + plusBadgeWidth > containerWidth) {
      shown -= 1
      used -= estimateBadgeWidth(routeList[shown].routeName)
    }
    return Math.max(0, shown)
  }

  function updateRouteBadgeVisibleCounts() {
    if (!result || result.loading || result.error) {
      setRouteBadgeVisibleCounts({})
      return
    }
    const next = {}
    for (const g of (result.groups || [])) {
      const groupKey = getGroupKey(g)
      const routeList = getGroupRouteBadges(g)
      // Show all badges (no overflow +n)
      next[groupKey] = (routeList || []).length
    }
    setRouteBadgeVisibleCounts(next)
  }

  function handleSelectGroupRoute(groupKey, g, routeId) {
    const gt = groupTimetables[groupKey]
    if (!gt || !gt.data) {
      // if data not loaded yet, fetch and request this routeId so fetchGroupTimetable stores selection
      fetchGroupTimetable(g, routeId)
      return
    }
    setGroupTimetables((prev) => ({ ...prev, [groupKey]: { ...prev[groupKey], selectedRouteId: routeId || null } }))
  }

  function handleSelectAllGroupsRoute(routeId) {
    setAllGroupsSelectedRouteId(routeId || null)
  }

  function resetTimetableViews(options = {}) {
    const keepExpandedGroup = !!options.keepExpandedGroup
    setGroupTimetables({})
    setAllGroupsTimetable(null)
    setShowGroupList(true)
    setShowAllGroupsTimetable(false)
    setGroupTimetableHidden({})
    setAllGroupsHighlightedRowIndex(-1)
    setGroupHighlightedRowIndexes({})
    if (!keepExpandedGroup) {
      setExpandedGroupKey(null)
    }
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

  function renderGroupStationOverlays(groups) {
    if (!mapRef.current || typeof window === 'undefined' || !window.kakao || !window.kakao.maps) 
    clearGroupStationOverlays()
    const list = groups || []
    const posMap = {}
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
        const pos = new window.kakao.maps.LatLng(lat, lon)
        if (!posMap[key]) {
          const marker = new window.kakao.maps.Marker({
            position: pos,
            title: `${p.station.stationName || ''}`,
          })
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
      const overlay = new window.kakao.maps.CustomOverlay({
        position: item.position,
        content,
        xAnchor: 0.5,
        yAnchor: 1.25,
      })
      overlay.setMap(mapRef.current)
      groupStationOverlaysRef.current.push(overlay)
      }
  }

  function toCoordString(v) {
    const n = Number(v)
    if (Number.isNaN(n)) return String(v)
    return n.toFixed(6)
  }

  function parseCoordValue(v) {
    if (v == null) return Number.NaN
    const s = String(v).trim()
    if (!s) return Number.NaN
    const n = Number(s)
    return Number.isFinite(n) ? n : Number.NaN
  }

  function getPlaceDisplayText(place) {
    if (!place) return ''
    const text = place.place_name || place.address_name || place.road_address_name || ''
    return String(text).trim()
  }

  function resolveAddressTextByCoord(lon, lat) {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.kakao || !window.kakao.maps || !window.kakao.maps.services || !geocoderRef.current) {
        resolve('')
        return
      }
      geocoderRef.current.coord2Address(Number(lon), Number(lat), (result, status) => {
        if (status !== window.kakao.maps.services.Status.OK || !result || !result[0]) {
          resolve('')
          return
        }
        const item = result[0]
        const road = item && item.road_address ? item.road_address.address_name : ''
        const jibun = item && item.address ? item.address.address_name : ''
        resolve(String(road || jibun || '').trim())
      })
    })
  }

  function formatDateInput(d) {
    const y = String(d.getFullYear())
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function getDateBounds() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() - 1)
    const minDate = new Date(today)
    minDate.setDate(minDate.getDate() - 15)
    return {
      min: formatDateInput(minDate),
      max: formatDateInput(maxDate),
    }
  }

  function clampDateValue(v, min, max) {
    if (!v) return v
    if (min && v < min) return min
    if (max && v > max) return max
    return v
  }

  function getQuickDayValue(daysAgo, bounds = dateBounds) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - daysAgo)
    return clampDateValue(formatDateInput(d), bounds.min, bounds.max)
  }

  function setStartPoint(lon, lat) {
    setAx(toCoordString(lon))
    setAy(toCoordString(lat))
  }

  function setEndPoint(lon, lat) {
    setBx(toCoordString(lon))
    setBy(toCoordString(lat))
  }

  function swapStartEndPoints() {
    const prevAx = ax
    const prevAy = ay
    const prevBx = bx
    const prevBy = by
    const prevStartKeyword = startKeyword
    const prevEndKeyword = endKeyword
    const prevStartRadius = startRadius
    const prevEndRadius = endRadius

    setAx(prevBx)
    setAy(prevBy)
    setBx(prevAx)
    setBy(prevAy)
    setStartKeyword(prevEndKeyword)
    setEndKeyword(prevStartKeyword)
    setStartRadius(prevEndRadius)
    setEndRadius(prevStartRadius)
  }

  function getApiBaseUrl() {
    // API base is proxied via Next.js server at /api/*
    return ''
  }

  function getMarkerImage(type) {
    if (typeof window === 'undefined' || !window.kakao || !window.kakao.maps) return null
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
    const image = new window.kakao.maps.MarkerImage(
      src,
      new window.kakao.maps.Size(28, 36),
      { offset: new window.kakao.maps.Point(14, 36) }
    )
    markerImagesRef.current[type] = image
    return image
  }

  function getMarkerLabelHtml(type) {
    const bg = type === 'start' ? '#2563eb' : '#ef4444'
    const text = type === 'start' ? '출발지' : '도착지'
    return `<div style="background:${bg};color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700;white-space:nowrap;">${text}</div>`
  }

  function updateMarker(type, lon, lat) {
    if (!mapRef.current || typeof window === 'undefined' || !window.kakao || !window.kakao.maps) return
    const lng = parseCoordValue(lon)
    const ltd = parseCoordValue(lat)
    if (Number.isNaN(lng) || Number.isNaN(ltd)) return
    const pos = new window.kakao.maps.LatLng(ltd, lng)
    const prev = markersRef.current[type]
    if (!prev) {
      const mk = new window.kakao.maps.Marker({
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
      const overlay = new window.kakao.maps.CustomOverlay({
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

  function focusStartEndOnMap() {
    if (!mapRef.current || typeof window === 'undefined' || !window.kakao || !window.kakao.maps) return
    const startLng = parseCoordValue(ax)
    const startLat = parseCoordValue(ay)
    const endLng = parseCoordValue(bx)
    const endLat = parseCoordValue(by)
    if ([startLng, startLat, endLng, endLat].some((v) => Number.isNaN(v))) return

    const startPos = new window.kakao.maps.LatLng(startLat, startLng)
    const endPos = new window.kakao.maps.LatLng(endLat, endLng)
    if (startLng === endLng && startLat === endLat) {
      mapRef.current.setCenter(startPos)
      mapRef.current.setLevel(4)
      return
    }

    const bounds = new window.kakao.maps.LatLngBounds()
    bounds.extend(startPos)
    bounds.extend(endPos)
    mapRef.current.setBounds(bounds)
  }

  function updateCircle(type, lon, lat, radiusMeters) {
    if (!mapRef.current || typeof window === 'undefined' || !window.kakao || !window.kakao.maps) return
    const lng = parseCoordValue(lon)
    const ltd = parseCoordValue(lat)
    const rad = Number(radiusMeters)
    if (Number.isNaN(lng) || Number.isNaN(ltd) || Number.isNaN(rad) || rad <= 0) return

    const center = new window.kakao.maps.LatLng(ltd, lng)
    const strokeColor = type === 'start' ? '#2563eb' : '#ef4444'
    const fillColor = type === 'start' ? '#93c5fd' : '#fca5a5'

    const prev = circlesRef.current[type]
    if (!prev) {
      const circle = new window.kakao.maps.Circle({
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

  useEffect(() => {
    const bounds = getDateBounds()
    setDateBounds(bounds)
    setSday((prev) => {
      if (prev) return clampDateValue(prev, bounds.min, bounds.max)
      return bounds.max
    })
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    updateMarker('start', ax, ay)
    updateMarker('end', bx, by)
    updateCircle('start', ax, ay, startRadius)
    updateCircle('end', bx, by, endRadius)
  }, [ax, ay, bx, by, startRadius, endRadius])

  useEffect(() => {
    if (!mapRef.current) return
    if (!result || result.loading || result.error) {
      clearGroupStationOverlays()
      return
    }
    if (!expandedGroupKey) {
      renderGroupStationOverlays(result.groups || [])
      return
    }
    const selected = (result.groups || []).find((g) => getGroupKey(g) === expandedGroupKey)
    if (!selected) {
      renderGroupStationOverlays(result.groups || [])
      return
    }
    renderGroupStationOverlays([selected])
  }, [result, expandedGroupKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const appKey = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY) || ''
    if (!appKey) {
      setMapError('NEXT_PUBLIC_KAKAO_MAP_API_KEY 환경변수를 설정하세요.')
      return
    }

    const initMap = () => {
      if (!window.kakao || !window.kakao.maps || !mapContainerRef.current) return
      window.kakao.maps.load(() => {
        const ayNum = parseCoordValue(ay)
        const axNum = parseCoordValue(ax)
        const center = new window.kakao.maps.LatLng(
          Number.isNaN(ayNum) ? defaultMapCenter.lat : ayNum,
          Number.isNaN(axNum) ? defaultMapCenter.lon : axNum
        )
        const map = new window.kakao.maps.Map(mapContainerRef.current, {
          center,
          level: 5,
        })
        mapRef.current = map
        placesRef.current = new window.kakao.maps.services.Places()
        geocoderRef.current = new window.kakao.maps.services.Geocoder()
        updateMarker('start', ax, ay)
        updateMarker('end', bx, by)
        updateCircle('start', ax, ay, startRadius)
        updateCircle('end', bx, by, endRadius)
        if (result && result.groups) {
          if (!expandedGroupKey) {
            renderGroupStationOverlays(result.groups)
          } else {
            const selected = result.groups.find((g) => getGroupKey(g) === expandedGroupKey)
            if (selected) {
              renderGroupStationOverlays([selected])
            } else {
              renderGroupStationOverlays(result.groups)
            }
          }
        }
        window.kakao.maps.event.addListener(map, 'click', (mouseEvent) => {
          const latLng = mouseEvent.latLng
          const lon = latLng.getLng()
          const lat = latLng.getLat()
          setPendingMapPoint({ lon: toCoordString(lon), lat: toCoordString(lat) })
        })
      })
    }

    if (window.kakao && window.kakao.maps) {
      initMap()
      return
    }

    const scriptId = 'kakao-map-sdk'
    const existing = document.getElementById(scriptId)
    if (existing) {
      existing.addEventListener('load', initMap, { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.async = true
    script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey=' + appKey
    script.onload = initMap
    script.onerror = () => setMapError('카카오 지도 SDK를 불러오지 못했습니다.')
    document.head.appendChild(script)
  }, [])

  async function submit(e) {
    e.preventDefault()
    e.preventDefault()
    await doSearch({ ax, ay, bx, by, aradius: startRadius, bradius: endRadius, sday })
  }

  async function doSearch(opts) {
    const { ax: axv, ay: ayv, bx: bxv, by: byv, aradius, bradius, sday: qsday } = opts || {}
    const startLng = parseCoordValue(axv)
    const startLat = parseCoordValue(ayv)
    const endLng = parseCoordValue(bxv)
    const endLat = parseCoordValue(byv)
    if ([startLng, startLat, endLng, endLat].some((v) => Number.isNaN(v))) {
      setResult({ error: '출발지와 도착지를 먼저 선택하세요.' })
      return
    }
    setResult({ loading: true })
    resetTimetableViews()
    const base = getApiBaseUrl()
    const params = { ax: axv, ay: ayv, bx: bxv, by: byv, aradius: aradius || startRadius, bradius: bradius || endRadius }
    if (qsday) params.sday = qsday
    const q = new URLSearchParams(params)
    const r = await fetch('/api/findRoutes?' + q.toString())
    const j = await r.json()
    setShowAllGroupsTimetable(false)
    setShowGroupList(true)
    setResult(j)
  }

  function handleSdayChange(v) {
    setSday(clampDateValue(v, dateBounds.min, dateBounds.max))
    resetTimetableViews({ keepExpandedGroup: true })
  }

  function setQuickDay(daysAgo) {
    const val = getQuickDayValue(daysAgo)
    handleSdayChange(val)
  }

  function handleStartRadiusChange(v) {
    setStartRadius(v)
    resetTimetableViews()
  }

  function handleEndRadiusChange(v) {
    setEndRadius(v)
    resetTimetableViews()
  }

  function selectPlace(type, place) {
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
    if (mapRef.current && typeof window !== 'undefined' && window.kakao && window.kakao.maps) {
      const pos = new window.kakao.maps.LatLng(Number(lat), Number(lon))
      mapRef.current.panTo(pos)
    }
    resetTimetableViews()
  }

  async function applyPendingMapPoint(type) {
    if (!pendingMapPoint) return
    const lon = pendingMapPoint.lon
    const lat = pendingMapPoint.lat
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

  function searchPlace(type) {
    const keyword = type === 'start' ? startKeyword : endKeyword
    if (type === 'start') {
      setStartSearchOpened(true)
    } else {
      setEndSearchOpened(true)
    }
    if (!keyword || !keyword.trim()) {
      if (type === 'start') {
        setStartSearchResults([])
        setStartSearchMsg('검색어를 입력하세요.')
      } else {
        setEndSearchResults([])
        setEndSearchMsg('검색어를 입력하세요.')
      }
      return
    }
    if (!placesRef.current || !mapRef.current || typeof window === 'undefined' || !window.kakao || !window.kakao.maps) return

    if (type === 'start') {
      setStartSearchMsg('검색 중...')
    } else {
      setEndSearchMsg('검색 중...')
    }

    placesRef.current.keywordSearch(keyword.trim(), (data, status) => {
      if (status !== window.kakao.maps.services.Status.OK || !data || data.length === 0) {
        if (type === 'start') {
          setStartSearchResults([])
          setStartSearchMsg('검색 결과가 없습니다.')
        } else {
          setEndSearchResults([])
          setEndSearchMsg('검색 결과가 없습니다.')
        }
        return
      }
      if (type === 'start') {
        setStartSearchResults(data)
        setStartSearchMsg('')
      } else {
        setEndSearchResults(data)
        setEndSearchMsg('')
      }
    })
  }

  function handlePlaceKeywordKeyDown(e, type) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    searchPlace(type)
  }

  async function fetchGroupTimetable(g, routeId = null) {
    const key = g.board.stationId + '-' + g.alight.stationId
    setShowAllGroupsTimetable(false)
    setShowGroupList(true)
    setGroupTimetableHidden((p) => ({ ...p, [key]: false }))
    setGroupTimetables((p) => ({ ...p, [key]: { loading: true } }))
    try {
      const base = getApiBaseUrl()
      const params = new URLSearchParams({ boardStationId: g.board.stationId, alightStationId: g.alight.stationId })
      if (sday) params.set('sday', sday)
      // pass allowedRouteIds (comma-separated) so server can restrict to group's routes
      try {
        const allowed = (g.routes || []).map((x) => x.routeId).filter(Boolean).join(',')
        if (allowed) params.set('allowedRouteIds', allowed)
      } catch (e) {
        // ignore if group shape unexpected
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
      const base = getApiBaseUrl()
      const params = new URLSearchParams({ ax, ay, bx, by, aradius: startRadius, bradius: endRadius })
      if (sday) params.set('sday', sday)
      const r = await fetch('/api/allGroupsTimetable?' + params.toString())
      const j = await r.json()
      setAllGroupsTimetable({ loading: false, data: j })
    } catch (err) {
      setAllGroupsTimetable({ loading: false, error: String(err) })
    }
  }

  function formatDuration(boardTime, alightTime) {
    if (!boardTime || !alightTime) return '-'
    const b = new Date(String(boardTime).replace(' ', 'T'))
    const a = new Date(String(alightTime).replace(' ', 'T'))
    if (Number.isNaN(b.getTime()) || Number.isNaN(a.getTime())) return '-'
    const diffMin = Math.floor((a.getTime() - b.getTime()) / 60000)
    if (diffMin < 0) return '-'
    const h = Math.floor(diffMin / 60)
    const m = diffMin % 60
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
  }

  function formatDisplayTime(dateTime, queryDay) {
    if (!dateTime) return '-'
    const s = String(dateTime).trim()
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/)
    if (!m) return s

    const datePart = m[1] + '-' + m[2] + '-' + m[3]
    let hour = Number(m[4])
    const minute = m[5]

    if (queryDay) {
      const p = String(queryDay).split('-').map(Number)
      if (p.length === 3) {
        const next = new Date(p[0], p[1] - 1, p[2] + 1)
        const ny = String(next.getFullYear())
        const nm = String(next.getMonth() + 1).padStart(2, '0')
        const nd = String(next.getDate()).padStart(2, '0')
        const nextDay = ny + '-' + nm + '-' + nd
        if (datePart === nextDay) {
          hour += 24
        }
      }
    }

    return String(hour).padStart(2, '0') + ':' + minute
  }

  function getRouteNameStyle(routeTypeCd, routeName) {
    const code = String(routeTypeCd || '').trim()
    const name = String(routeName || '')

    if (code === '16') {
      return { color: '#e60012', fontWeight: 700 }
    }
    if (code === '11' || code === '14' || code === '21') {
      return { color: '#e60012', fontWeight: 700 }
    }
    if (code === '12' || code === '22' || code === '42') {
      return { color: '#0068b7', fontWeight: 700 }
    }
    if (code === '13' || code === '23') {
      return { color: '#33CC99', fontWeight: 700 }
    }
    if (code === '30') {
      return { color: '#ffc600', fontWeight: 700 }
    }
    if (code === '15') {
      return { color: '#bb2266', fontWeight: 700 }
    }
    return { color: '#6b7280', fontWeight: 700 }
  }

  function getDisplayMinutes(dateTime) {
    const t = formatDisplayTime(dateTime, sday)
    const m = String(t).match(/^(\d+):(\d{2})$/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }

  function getNextBoardRowIndex(entries) {
    if (!entries || entries.length === 0) return -1
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    for (let i = 0; i < entries.length; i += 1) {
      const mins = getDisplayMinutes(entries[i] && entries[i].boardTime)
      if (mins != null && mins >= nowMinutes) {
        return i
      }
    }
    return 0
  }

  function scrollTableToRow(container, rowIndex) {
    if (!container || rowIndex < 0) return
    const row = container.querySelector(`[data-row-index=\"${rowIndex}\"]`)
    if (!row || typeof row.scrollIntoView !== 'function') return
    row.scrollIntoView({ block: 'nearest' })
  }

  function moveAllGroupsToCurrentTime() {
    const combinedAll = (allGroupsTimetable && allGroupsTimetable.data && allGroupsTimetable.data.combined) || []
    const entries = allGroupsSelectedRouteId ? (combinedAll || []).filter((e) => String(e.routeId) === String(allGroupsSelectedRouteId)) : combinedAll
    const rowIndex = getNextBoardRowIndex(entries)
    if (rowIndex < 0) return
    setAllGroupsHighlightedRowIndex(rowIndex)
    setTimeout(() => scrollTableToRow(allGroupsTableScrollRef.current, rowIndex), 0)
  }

  function moveGroupToCurrentTime(groupKey) {
    const gt = groupTimetables[groupKey]
    if (!gt || gt.loading || gt.error || !gt.data) return
    // If a specific route is selected for this group, use that route's entries (with route metadata).
    let entries = []
    if (gt.selectedRouteId) {
      const tt = (gt.data.timetables || []).find((x) => String(x.routeId) === String(gt.selectedRouteId))
      if (tt && tt.entries) {
        entries = (tt.entries || []).map((e) => ({ ...e, routeId: tt.routeId, routeName: tt.routeName, routeTypeCd: tt.routeTypeCd, orderGap: tt.orderGap, boardOrder: tt.boardOrder, alightOrder: tt.alightOrder }))
      }
    } else {
      entries = gt.data.combined || []
    }
    const rowIndex = getNextBoardRowIndex(entries)
    if (rowIndex < 0) return
    setGroupHighlightedRowIndexes((prev) => ({ ...prev, [groupKey]: rowIndex }))
    const container = groupTableScrollRefs.current[groupKey]
    setTimeout(() => scrollTableToRow(container, rowIndex), 0)
  }

  function foldAllGroupsTimetable() {
    setShowAllGroupsTimetable(false)
    setShowGroupList(true)
  }

  function foldGroupTimetable(groupKey) {
    setGroupTimetableHidden((p) => ({ ...p, [groupKey]: true }))
  }

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
    updateRouteBadgeVisibleCounts()
    const onResize = () => updateRouteBadgeVisibleCounts()
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResize)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onResize)
      }
    }
  }, [result])

  function onGroupCardClick(e, groupKey) {
    const target = e.target
    if (target && target.closest && target.closest('button, a, input, select, textarea, label')) {
      return
    }
    const willExpand = expandedGroupKey !== groupKey
    setExpandedGroupKey((prev) => (prev === groupKey ? null : groupKey))
    // If expanding and date selected, fetch group's timetable immediately
    if (willExpand && sday) {
      const grp = (result && result.groups ? result.groups : []).find((gg) => getGroupKey(gg) === groupKey)
      if (grp) fetchGroupTimetable(grp)
    }
  }

  function buildShareUrl() {
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
      const base = (typeof window !== 'undefined' && window.location) ? window.location.origin + window.location.pathname : ''
      const qs = params.toString()
      return qs ? `${base}?${qs}` : base
    } catch (e) {
      return ''
    }
  }

  async function handleShare() {
    const url = buildShareUrl()
    if (!url) {
      alert('공유 가능한 URL을 생성할 수 없습니다.')
      return
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: '버스탈시간 검색 결과', text: '검색 결과를 공유합니다.', url })
        return
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url)
        alert('공유 링크를 클립보드에 복사했습니다.')
        return
      }
      // Fallback to prompt
      // eslint-disable-next-line no-alert
      prompt('아래 링크를 복사하세요:', url)
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert('공유에 실패했습니다.')
    }
  }

  // On first load, parse query params and apply to state; then auto-search if coordinates present.
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
        const opts = { ax: qAx, ay: qAy, bx: qBx, by: qBy, aradius: qar || startRadius, bradius: qbr || endRadius, sday: qsday }
        setTimeout(() => { doSearch(opts).catch(() => {}) }, 50)
      }
    } catch (e) {
      // ignore
    }
  }, [])

  const showStartSearchPanel = startSearchOpened
  const showEndSearchPanel = endSearchOpened
  const showSearchPanels = showStartSearchPanel || showEndSearchPanel
  const quickDay1 = getQuickDayValue(1)
  const quickDay2 = getQuickDayValue(2)
  const quickDay7 = getQuickDayValue(7)

  return (
    <div className="p-5 font-sans text-[80%] text-slate-900 sm:text-[100%]">
      <Head>
        <title>버스탈시간-경기도 버스 시간 이력 조회 서비스</title>
      </Head>
      <h1 className="text-2xl font-bold">버스탈시간</h1>
      <h3 className="text-l font-semibold mb-3">경기도 버스 시간 이력 조회 서비스</h3>
      <div className="mb-3 max-w-[900px] rounded-lg border border-slate-300 p-3">
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
            <div className="flex items-center">
              <input className="min-w-0 h-9 flex-1 rounded border border-slate-300 px-2 py-1" value={startKeyword} onChange={(e) => setStartKeyword(e.target.value)} onKeyDown={(e) => handlePlaceKeywordKeyDown(e, 'start')} placeholder="출발지 검색" />
              <button className="h-9 w-9 shrink-0 rounded border border-slate-300 text-base hover:bg-slate-50" type="button" onClick={() => searchPlace('start')} aria-label="출발지 찾기" title="출발지 찾기">🔍</button>
            </div>
            <div className="flex items-center">
              <input className="min-w-0 h-9 flex-1 rounded border border-slate-300 px-2 py-1" value={endKeyword} onChange={(e) => setEndKeyword(e.target.value)} onKeyDown={(e) => handlePlaceKeywordKeyDown(e, 'end')} placeholder="도착지 검색" />
              <button className="h-9 w-9 shrink-0 rounded border border-slate-300 text-base hover:bg-slate-50" type="button" onClick={() => searchPlace('end')} aria-label="도착지 찾기" title="도착지 찾기">🔍</button>
            </div>
          </div>
        </div>

        {showSearchPanels ? (
          <div className="mb-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            {showStartSearchPanel ? (
              <div style={{ border: '1px solid #eee', borderRadius: 6, padding: 8, minHeight: 90 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>출발지 검색결과</div>
                {startSearchMsg ? <div style={{ color: '#666', marginBottom: 6 }}>{startSearchMsg}</div> : null}
                <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 140, overflow: 'auto' }}>
                  {startSearchResults.map((p, idx) => (
                    <li key={'start-' + idx} style={{ marginBottom: 6 }}>
                      <button type="button" onClick={() => selectPlace('start', p)}>{p.place_name || p.address_name || '선택'}</button>
                      <div style={{ fontSize: 12, color: '#666' }}>{p.address_name || p.road_address_name || ''}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {showEndSearchPanel ? (
              <div style={{ border: '1px solid #eee', borderRadius: 6, padding: 8, minHeight: 90 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>도착지 검색결과</div>
                {endSearchMsg ? <div style={{ color: '#666', marginBottom: 6 }}>{endSearchMsg}</div> : null}
                <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 140, overflow: 'auto' }}>
                  {endSearchResults.map((p, idx) => (
                    <li key={'end-' + idx} style={{ marginBottom: 6 }}>
                      <button type="button" onClick={() => selectPlace('end', p)}>{p.place_name || p.address_name || '선택'}</button>
                      <div style={{ fontSize: 12, color: '#666' }}>{p.address_name || p.road_address_name || ''}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <strong>지도 핀 지정:</strong>
          <button className="rounded border border-slate-300 px-2 py-1 mr-2 hover:bg-slate-50" type="button" onClick={focusStartEndOnMap}>출발/도착 한눈에 보기</button>
          <label className="flex items-center gap-1.5">
            <strong>출발 반경</strong>
            <input type="range" min="100" max="2000" step="50" value={startRadius} onChange={(e) => handleStartRadiusChange(e.target.value)} />
            <span>{startRadius}m</span>
          </label>
          <label className="flex items-center gap-1.5">
            <strong>도착 반경</strong>
            <input type="range" min="100" max="2000" step="50" value={endRadius} onChange={(e) => handleEndRadiusChange(e.target.value)} />
            <span>{endRadius}m</span>
          </label>
          <span className="text-slate-500">지도를 클릭한 뒤 출발지/도착지를 선택하세요.</span>
        </div>

        {pendingMapPoint ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-sky-200 bg-sky-50 p-2">
            <span className="text-sm text-slate-700">선택 좌표: ({pendingMapPoint.lon}, {pendingMapPoint.lat})</span>
            <button className="rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => applyPendingMapPoint('start')}>출발지로 설정</button>
            <button className="rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => applyPendingMapPoint('end')}>도착지로 설정</button>
            <button className="rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => setPendingMapPoint(null)}>취소</button>
          </div>
        ) : null}

        {mapError ? <div style={{ color: 'red', marginBottom: 8 }}>{mapError}</div> : null}
        <div ref={mapContainerRef} style={{ width: '100%', height: 360, borderRadius: 6, border: '1px solid #ddd' }} />
      </div>

      <form onSubmit={submit} className="grid max-w-[640px] gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <div className="flex flex-wrap items-center">
            <label className="mr-2"><strong>날짜:</strong></label>
            <input
              type="date"
              value={sday}
              min={dateBounds.min || undefined}
              max={dateBounds.max || undefined}
              onChange={(e) => handleSdayChange(e.target.value)}
              className="mr-2 rounded border border-slate-300 px-2 py-1"
            />
          </div>
          <div className="flex flex-wrap items-center gap-0">
            <button className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50" style={sday === quickDay1 ? { backgroundColor: '#e8f0ff' } : undefined} type="button" onClick={() => setQuickDay(1)}>1일전</button>
            <button className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50" style={sday === quickDay2 ? { backgroundColor: '#e8f0ff' } : undefined} type="button" onClick={() => setQuickDay(2)}>2일전</button>
            <button className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50" style={sday === quickDay7 ? { backgroundColor: '#e8f0ff' } : undefined} type="button" onClick={() => setQuickDay(7)}>1주전</button>
          </div>
        </div>
        <div>
          <button
            type="submit"
            className="h-11 w-[180px] rounded bg-slate-900 text-base font-bold text-white hover:bg-slate-700"
          >
            검색
          </button>
        </div>
      </form>

      <div className="mt-5">
        {result == null ? null : result.loading ? (
          <div>검색 중...</div>
        ) : result.error ? (
          <div style={{ color: 'red' }}>{result.error}</div>
        ) : (
          <div className="max-w-[900px]">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>검색 결과: {(result.groups || []).length}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleShare}
                  title="검색 결과 공유"
                  aria-label="검색 결과 공유"
                  className="h-8 w-8 rounded border border-slate-300 bg-white flex items-center justify-center hover:bg-slate-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14"></path>
                    <path d="M5 12l7-7 7 7"></path>
                    <rect x="5" y="19" width="14" height="2" rx="1"></rect>
                  </svg>
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <button className="rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={fetchAllGroupsTimetable} disabled={!sday}>모든 결과 통합 시간이력</button>
              {!sday ? <span style={{ marginLeft: 8, color: '#666' }}>날짜를 선택하세요.</span> : null}
            </div>

            {allGroupsTimetable && showAllGroupsTimetable ? (
              <div style={{ marginBottom: 14, background: '#f1f7ff', border: '1px solid #cfe2ff', borderRadius: 8, padding: 10 }}>
                {allGroupsTimetable.loading ? (
                  <div>전체 결과 시간이력 조회 중...</div>
                ) : allGroupsTimetable.error ? (
                  <div style={{ color: 'red' }}>{allGroupsTimetable.error}</div>
                ) : (
                  <div>
                    <div style={{ position: 'sticky', top: 0, zIndex: 3, background: '#f1f7ff', padding: '4px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div><strong>전체 결과 통합 시간이력:</strong> {(allGroupsTimetable.data && allGroupsTimetable.data.combined ? allGroupsTimetable.data.combined.length : 0)}회</div>
                        <button
                          type="button"
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                          onClick={moveAllGroupsToCurrentTime}
                        >
                          현재시간
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                          onClick={foldAllGroupsTimetable}
                        >
                          테이블 접기
                        </button>
                      </div>
                      {/* Badge row for filtering combined table by route */}
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto', padding: '6px 2px' }}>
                        <button type="button" onClick={() => handleSelectAllGroupsRoute(null)} style={{ padding: '4px 8px', borderRadius: 9999, border: '1px solid #e5e7eb', background: allGroupsSelectedRouteId ? '#fff' : '#2563eb', color: allGroupsSelectedRouteId ? '#374151' : '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>All</button>
                        {(() => {
                          const combined = (allGroupsTimetable.data && allGroupsTimetable.data.combined) || []
                          const seen = new Map()
                          for (const e of combined) {
                            const rid = String(e.routeId || '')
                            if (!rid || seen.has(rid)) continue
                            seen.set(rid, { routeId: rid, routeName: e.routeName, routeTypeCd: e.routeTypeCd })
                          }
                          const arr = Array.from(seen.values())
                          arr.sort(compareRoutes)
                          return arr.map((r) => (
                            <button key={r.routeId} type="button" onClick={() => handleSelectAllGroupsRoute(r.routeId)} style={{ padding: '4px 8px', borderRadius: 9999, border: '1px solid #e5e7eb', background: String(allGroupsSelectedRouteId) === String(r.routeId) ? '#2563eb' : '#fff', color: String(allGroupsSelectedRouteId) === String(r.routeId) ? '#fff' : '#374151', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.routeName}</button>
                          ))
                        })()}
                      </div>
                    </div>
                    <div ref={allGroupsTableScrollRef} style={{ marginTop: 6 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ position: 'sticky', top: 34, zIndex: 2, background: '#fff', textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 4px' }}>노선번호</th>
                            <th style={{ position: 'sticky', top: 34, zIndex: 2, background: '#fff', textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 4px' }}>탑승정류장</th>
                            <th style={{ position: 'sticky', top: 34, zIndex: 2, background: '#fff', textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 4px' }}>하차정류장</th>
                            <th style={{ position: 'sticky', top: 34, zIndex: 2, background: '#fff', textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 4px' }}>탑승시간</th>
                            <th style={{ position: 'sticky', top: 34, zIndex: 2, background: '#fff', textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 4px' }}>하차시간</th>
                            <th style={{ position: 'sticky', top: 34, zIndex: 2, background: '#fff', textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 4px' }}>소요시간</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const combinedAll = (allGroupsTimetable.data && allGroupsTimetable.data.combined) || []
                            const filtered = allGroupsSelectedRouteId ? combinedAll.filter((x) => String(x.routeId) === String(allGroupsSelectedRouteId)) : combinedAll
                            return filtered.map((e, idx2) => (
                              <tr data-row-index={idx2} key={String(e.routeId || '') + '-' + String(e.vehId || '') + '-' + idx2} style={allGroupsHighlightedRowIndex === idx2 ? { background: '#fff9db' } : undefined}>
                                <td style={{ borderBottom: '1px solid #eee', padding: '6px 4px' }}><span style={getRouteNameStyle(e.routeTypeCd, e.routeName)}>{e.routeName || e.routeId}</span></td>
                                <td style={{ borderBottom: '1px solid #eee', padding: '6px 4px' }}>{e.boardStationName || '-'}</td>
                                <td style={{ borderBottom: '1px solid #eee', padding: '6px 4px' }}>{e.alightStationName || '-'}</td>
                                <td style={{ borderBottom: '1px solid #eee', padding: '6px 4px' }}>{formatDisplayTime(e.boardTime, sday)}</td>
                                <td style={{ borderBottom: '1px solid #eee', padding: '6px 4px' }}>{formatDisplayTime(e.alightTime, sday)}</td>
                                <td style={{ borderBottom: '1px solid #eee', padding: '6px 4px' }}>{formatDuration(e.boardTime, e.alightTime)}</td>
                              </tr>
                            ))
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {allGroupsTimetable && showAllGroupsTimetable && !showGroupList ? (
              <div style={{ position: 'sticky', bottom: 12, zIndex: 20, display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowGroupList(true)
                    setShowAllGroupsTimetable(false)
                  }}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50"
                >
                  결과목록보기
                </button>
              </div>
            ) : null}

            {showAllGroupsTimetable && !showGroupList ? null : (result.groups || []).length === 0 ? (
              <div>조회에 맞는 경로가 없습니다.</div>
            ) : (
              (result.groups || []).map((g, idx) => {
                const groupKey = getGroupKey(g)
                const isExpanded = expandedGroupKey === groupKey
                const gt = groupTimetables[groupKey]
                // If a specific route was requested, show only that route's entries.
                let combined = []
                if (gt && gt.data) {
                  if (gt.selectedRouteId) {
                    const tt = (gt.data.timetables || []).find((x) => String(x.routeId) === String(gt.selectedRouteId))
                    if (tt && tt.entries) {
                      combined = (tt.entries || []).map((e) => ({ ...e, routeId: tt.routeId, routeName: tt.routeName, routeTypeCd: tt.routeTypeCd, orderGap: tt.orderGap, boardOrder: tt.boardOrder, alightOrder: tt.alightOrder }))
                    } else {
                      combined = []
                    }
                  } else {
                    combined = gt.data.combined || []
                  }
                }
                const routeBadges = getGroupRouteBadges(g)
                const visibleRouteBadges = routeBadges
                return (
                  <div
                    key={groupKey + '-' + idx}
                    onClick={(e) => onGroupCardClick(e, groupKey)}
                    style={{
                      border: isExpanded ? '1px solid #2563eb' : '1px solid #ddd',
                      background: isExpanded ? '#eff6ff' : '#fff',
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <span style={{ background: '#111827', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>
                        결과 {idx + 1}
                      </span>
                      <span style={{ color: '#374151', fontSize: 13 }}>{isExpanded ? '접기' : '펼치기'}</span>
                    </div>
                    <div><strong>탑승:</strong> {g.board.stationName} ({Math.round(g.board.dist)}m)</div>
                    <div><strong>하차:</strong> {g.alight.stationName} ({Math.round(g.alight.dist)}m)</div>
                    <div style={{ marginTop: 6 }}>
                      <div
                        ref={(el) => {
                          routeBadgeRowRefs.current[groupKey] = el
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap' }}
                      >
                        {visibleRouteBadges.map((r) => (
                          <button
                            key={String(r.routeId || r.routeName)}
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation()
                              try {
                                fetchGroupTimetable(g, r.routeId)
                              } catch (e) {
                                // ignore
                              }
                            }}
                            style={{ cursor: 'pointer', ...getRouteNameStyle(r.routeTypeCd, r.routeName), border: '1px solid #e5e7eb', borderRadius: 9999, padding: '2px 8px', fontSize: 12, background: '#fff', flex: '0 0 auto', whiteSpace: 'nowrap' }}
                          >
                            {r.routeName}
                          </button>
                        ))}
                      </div>
                    </div>

                    {isExpanded ? (
                      <>
                        <div style={{ marginTop: 8 }}>
                          <button className="rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => fetchGroupTimetable(g)} disabled={!sday}>통합 시간이력</button>
                          {!sday ? <span style={{ marginLeft: 8, color: '#666' }}>날짜를 선택하세요.</span> : null}
                        </div>

                        {gt && !groupTimetableHidden[groupKey] ? (
                          <div style={{ marginTop: 10, background: '#fffbeb', border: '1px solid #fde68a', padding: 10, borderRadius: 6 }}>
                            {gt.loading ? (
                              <div>시간이력 조회 중...</div>
                            ) : gt.error ? (
                              <div style={{ color: 'red' }}>{gt.error}</div>
                            ) : (
                              <div>
                                <div style={{ position: 'sticky', top: 0, zIndex: 3, background: '#fffbeb', padding: '4px 0' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div><strong>통합 시간이력:</strong> {combined.length}회</div>
                                    <button
                                      type="button"
                                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                      onClick={() => moveGroupToCurrentTime(groupKey)}
                                    >
                                      현재시간
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                      onClick={() => foldGroupTimetable(groupKey)}
                                    >
                                      테이블 접기
                                    </button>
                                  </div>
                                  {/* Badge row for group-level filter */}
                                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto', padding: '6px 2px' }}>
                                    <button type="button" onClick={(ev) => { ev.stopPropagation(); handleSelectGroupRoute(groupKey, g, null) }} style={{ padding: '4px 8px', borderRadius: 9999, border: '1px solid #e5e7eb', background: (gt && gt.selectedRouteId) ? '#fff' : '#2563eb', color: (gt && gt.selectedRouteId) ? '#374151' : '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>All</button>
                                    {getGroupRouteBadges(g).map((r) => (
                                      <button key={r.routeId} type="button" onClick={(ev) => { ev.stopPropagation(); handleSelectGroupRoute(groupKey, g, r.routeId) }} style={{ padding: '4px 8px', borderRadius: 9999, border: '1px solid #e5e7eb', background: (gt && String(gt.selectedRouteId) === String(r.routeId)) ? '#2563eb' : '#fff', color: (gt && String(gt.selectedRouteId) === String(r.routeId)) ? '#fff' : '#374151', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.routeName}</button>
                                    ))}
                                  </div>
                                </div>
                                {combined.length > 0 ? (
                                  <div ref={(el) => { groupTableScrollRefs.current[groupKey] = el }} style={{ marginTop: 6 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                      <thead>
                                        <tr>
                                          <th style={{ position: 'sticky', top: 34, zIndex: 2, background: '#fef3c7', textAlign: 'left', borderBottom: '1px solid #f59e0b', padding: '6px 4px' }}>노선번호</th>
                                          <th style={{ position: 'sticky', top: 34, zIndex: 2, background: '#fef3c7', textAlign: 'left', borderBottom: '1px solid #f59e0b', padding: '6px 4px' }}>탑승시간</th>
                                          <th style={{ position: 'sticky', top: 34, zIndex: 2, background: '#fef3c7', textAlign: 'left', borderBottom: '1px solid #f59e0b', padding: '6px 4px' }}>하차시간</th>
                                          <th style={{ position: 'sticky', top: 34, zIndex: 2, background: '#fef3c7', textAlign: 'left', borderBottom: '1px solid #f59e0b', padding: '6px 4px' }}>소요시간</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {combined.map((e, cIdx) => (
                                          <tr data-row-index={cIdx} key={String(e.vehId || '') + '-' + cIdx} style={groupHighlightedRowIndexes[groupKey] === cIdx ? { background: '#fef3c7' } : undefined}>
                                            <td style={{ borderBottom: '1px solid #fde68a', padding: '6px 4px' }}><span style={getRouteNameStyle(e.routeTypeCd, e.routeName)}>{e.routeName || e.routeId || '-'}</span></td>
                                            <td style={{ borderBottom: '1px solid #fde68a', padding: '6px 4px' }}>{formatDisplayTime(e.boardTime, sday)}</td>
                                            <td style={{ borderBottom: '1px solid #fde68a', padding: '6px 4px' }}>{formatDisplayTime(e.alightTime, sday)}</td>
                                            <td style={{ borderBottom: '1px solid #fde68a', padding: '6px 4px' }}>{formatDuration(e.boardTime, e.alightTime)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : null}

                                <div style={{ marginTop: 8 }}><strong>노선별:</strong></div>
                                {(gt.data && gt.data.timetables ? gt.data.timetables : []).map((tt, tIdx) => (
                                  <div key={String(tt.routeId) + '-' + tIdx} style={{ marginTop: 6 }}>
                                    - <span style={getRouteNameStyle(tt.routeTypeCd, tt.routeName)}>{tt.routeName}</span> : {(tt.entries || []).length}회
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
