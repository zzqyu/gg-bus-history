import React from 'react'
import type { Group } from '../../types'

export interface MapViewQuery {
  ax: string | number
  ay: string | number
  bx: string | number
  by: string | number
  aradius: string | number
  bradius: string | number
}

function readCssToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || fallback
}

function asCoordinate(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function mapLabel(content: string, className: string): string {
  return `<div class="${className} rounded-full px-2.5 py-1 text-xs font-bold text-white shadow-md whitespace-nowrap">${content}</div>`
}

interface MapViewProps {
  query: MapViewQuery
  groups: Group[]
  /** [lon, lat] 좌표쌍. 대표 노선 폴리라인 — 없으면 마커/반경 원만 그린다. */
  routeLinePath?: number[][]
}

/**
 * 지도 화면(Phase 4 프로덕션 버전). `components/preview/claude2/MapView.tsx`(P3-T11)를 승격하며
 * `FIXTURE_*` 의존을 props로 교체했다 — SDK 초기화 로직 자체는 그대로다.
 *
 * `components/preview/LayoutC.tsx`의 지도 초기화 패턴(SDK 스크립트 동적 로드, 마커/반경 원/
 * 노선 폴리라인/정류장 오버레이, relayout 처리, 언마운트 정리)을 참고해 만들었다.
 */
export default function MapView({ query, groups, routeLinePath }: MapViewProps) {
  const mapHostRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<any>(null)
  const mapObjectsRef = React.useRef<any[]>([])
  const stationOverlaysRef = React.useRef<any[]>([])
  const routeLineRef = React.useRef<any>(null)
  const [mapReady, setMapReady] = React.useState(false)
  const [mapError, setMapError] = React.useState('')

  const relayoutMap = React.useCallback(() => {
    const kakao = typeof window === 'undefined' ? null : (window as any).kakao
    if (!mapRef.current || !kakao?.maps) return
    try {
      if (typeof mapRef.current.relayout === 'function') mapRef.current.relayout()
      if (kakao.maps.event && typeof kakao.maps.event.trigger === 'function') {
        kakao.maps.event.trigger(mapRef.current, 'resize')
      }
    } catch {
      // 컨테이너 크기 전환 중 짧은 순간 SDK가 relayout을 거부할 수 있다.
    }
  }, [])

  React.useEffect(() => {
    let disposed = false
    let resizeObserver: ResizeObserver | null = null

    function clearObjects() {
      for (const object of mapObjectsRef.current) {
        if (object && typeof object.setMap === 'function') object.setMap(null)
      }
      mapObjectsRef.current = []
      for (const overlay of stationOverlaysRef.current) {
        if (overlay && typeof overlay.setMap === 'function') overlay.setMap(null)
      }
      stationOverlaysRef.current = []
      if (routeLineRef.current && typeof routeLineRef.current.setMap === 'function') {
        routeLineRef.current.setMap(null)
      }
      routeLineRef.current = null
    }

    function addMapObjects(kakao: any, map: any) {
      const origin = readCssToken('origin', '#2563eb')
      const originFill = readCssToken('origin-fill', '#93c5fd')
      const destination = readCssToken('destination', '#ef4444')
      const destinationFill = readCssToken('destination-fill', '#fca5a5')
      const routeLine = readCssToken('route-line', '#4f46e5')
      const startPosition = new kakao.maps.LatLng(asCoordinate(query.ay, 37.5), asCoordinate(query.ax, 127.0))
      const endPosition = new kakao.maps.LatLng(asCoordinate(query.by, 37.5), asCoordinate(query.bx, 127.0))
      const bounds = new kakao.maps.LatLngBounds()
      bounds.extend(startPosition)
      bounds.extend(endPosition)

      const startMarker = new kakao.maps.Marker({ position: startPosition, map })
      const endMarker = new kakao.maps.Marker({ position: endPosition, map })
      mapObjectsRef.current.push(startMarker, endMarker)

      const startOverlay = new kakao.maps.CustomOverlay({
        position: startPosition,
        content: mapLabel('출발', 'bg-origin'),
        yAnchor: 2.2,
        zIndex: 5,
      })
      const endOverlay = new kakao.maps.CustomOverlay({
        position: endPosition,
        content: mapLabel('도착', 'bg-destination'),
        yAnchor: 2.2,
        zIndex: 5,
      })
      startOverlay.setMap(map)
      endOverlay.setMap(map)
      mapObjectsRef.current.push(startOverlay, endOverlay)

      const startCircle = new kakao.maps.Circle({
        center: startPosition,
        radius: asCoordinate(query.aradius, 900),
        strokeWeight: 1,
        strokeColor: origin,
        strokeOpacity: 0.7,
        strokeStyle: 'dash',
        fillColor: originFill,
        fillOpacity: 0.12,
        map,
      })
      const endCircle = new kakao.maps.Circle({
        center: endPosition,
        radius: asCoordinate(query.bradius, 900),
        strokeWeight: 1,
        strokeColor: destination,
        strokeOpacity: 0.7,
        strokeStyle: 'dash',
        fillColor: destinationFill,
        fillOpacity: 0.12,
        map,
      })
      mapObjectsRef.current.push(startCircle, endCircle)

      const path = (routeLinePath || []).map(
        ([lon, lat]) => new kakao.maps.LatLng(Number(lat), Number(lon))
      )
      if (path.length >= 2) {
        routeLineRef.current = new kakao.maps.Polyline({
          path,
          strokeWeight: 5,
          strokeColor: routeLine,
          strokeOpacity: 0.82,
          strokeStyle: 'solid',
          map,
        })
        for (const position of path) bounds.extend(position)
      }

      const seenStations = new Set<string>()
      for (const group of groups) {
        for (const side of ['board', 'alight'] as const) {
          const station = group[side]
          const stationKey = `${side}-${station.stationId}-${station.lat}-${station.lon}`
          if (seenStations.has(stationKey)) continue
          seenStations.add(stationKey)
          const position = new kakao.maps.LatLng(Number(station.lat), Number(station.lon))
          const label = side === 'board' ? 'A' : 'B'
          const className = side === 'board' ? 'bg-origin' : 'bg-alight'
          const overlay = new kakao.maps.CustomOverlay({
            position,
            content: mapLabel(label, className),
            yAnchor: 1.4,
            zIndex: 3,
          })
          overlay.setMap(map)
          stationOverlaysRef.current.push(overlay)
          bounds.extend(position)
        }
      }

      if (typeof map.setBounds === 'function') {
        map.setBounds(bounds, 48, 48, 48, 48)
      }
    }

    function initMap() {
      if (disposed) return
      const kakao = (window as any).kakao
      if (!kakao?.maps || !mapHostRef.current) return
      kakao.maps.load(() => {
        if (disposed || !mapHostRef.current || !kakao.maps) return
        const center = new kakao.maps.LatLng(asCoordinate(query.ay, 37.5), asCoordinate(query.ax, 127.0))
        const map = new kakao.maps.Map(mapHostRef.current, { center, level: 6 })
        mapRef.current = map
        addMapObjects(kakao, map)
        setMapReady(true)
        requestAnimationFrame(relayoutMap)
        window.setTimeout(relayoutMap, 160)
      })
    }

    const appKey = (process.env && process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY) || ''
    if (!appKey) {
      setMapError('NEXT_PUBLIC_KAKAO_MAP_API_KEY 환경변수를 설정하세요.')
      return () => undefined
    }

    const scriptId = 'kakao-map-sdk'
    const existing = document.getElementById(scriptId)
    if (existing) {
      if ((window as any).kakao?.maps) initMap()
      else existing.addEventListener('load', initMap, { once: true })
    } else {
      const script = document.createElement('script')
      script.id = scriptId
      script.async = true
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey=${appKey}`
      script.onload = initMap
      script.onerror = () => setMapError('카카오 지도 SDK를 불러오지 못했습니다.')
      document.head.appendChild(script)
    }

    if (mapHostRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => requestAnimationFrame(relayoutMap))
      resizeObserver.observe(mapHostRef.current)
    }

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      clearObjects()
      mapRef.current = null
      setMapReady(false)
    }
  }, [query.ax, query.ay, query.aradius, query.bx, query.by, query.bradius, groups, routeLinePath, relayoutMap])

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold text-primary">지도</p>
        <h2 className="mt-0.5 text-lg font-bold">정류장과 노선 경로를 지도에서 확인하세요</h2>
      </div>

      <div className="relative h-[420px] sm:h-[520px]">
        <div ref={mapHostRef} className="absolute inset-0 bg-slate-200" aria-label="카카오 지도" />

        {!mapReady && !mapError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-background/90 px-4 py-2 text-sm font-semibold text-foreground shadow-lg">
              지도 불러오는 중…
            </div>
          </div>
        )}
        {mapError && (
          <div className="absolute left-1/2 top-1/2 w-[min(90%,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-destructive/30 bg-background/95 p-5 text-center shadow-xl">
            <p className="text-sm font-bold text-destructive">지도를 표시할 수 없습니다</p>
            <p className="mt-2 text-xs text-muted-foreground">{mapError}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-origin" aria-hidden="true" />출발 반경</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-alight" aria-hidden="true" />정류장</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-destination" aria-hidden="true" />도착 반경</span>
        {routeLinePath && routeLinePath.length >= 2 && <span>노선 폴리라인 표시 중</span>}
      </div>
    </section>
  )
}
