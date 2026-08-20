import React from 'react'
import type { RealtimeArrivalItem } from '../types'

const CLIENT_CACHE_TTL_MS = 10_000
const MAX_CONCURRENT_REQUESTS = 8

type StationRealtimeMap = Record<string, RealtimeArrivalItem>
type CacheEntry = { expiresAt: number; value: StationRealtimeMap }

const realtimeCache = new Map<string, CacheEntry>()
const realtimeInFlight = new Map<string, Promise<StationRealtimeMap>>()

function normalizeStationIds(stationIds: string[]): string[] {
  return Array.from(
    new Set(
      (Array.isArray(stationIds) ? stationIds : [])
        .map((stationId) => String(stationId || '').trim())
        .filter(Boolean),
    ),
  ).sort()
}

async function fetchStationRealtime(stationId: string): Promise<StationRealtimeMap> {
  const cached = realtimeCache.get(stationId)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  if (cached) realtimeCache.delete(stationId)

  const pending = realtimeInFlight.get(stationId)
  if (pending) return pending

  const request = fetch('/api/realtimeArrivalList?' + new URLSearchParams({ stationId }))
    .then(async (response) => {
      if (!response.ok) throw new Error(`realtimeArrivalList ${response.status}`)
      const payload = await response.json()
      const byRouteId: StationRealtimeMap = {}
      const items: unknown[] = Array.isArray(payload?.items) ? payload.items : []
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const candidate = item as Partial<RealtimeArrivalItem>
        const routeId = String(candidate.routeId || '').trim()
        if (routeId) byRouteId[routeId] = candidate as RealtimeArrivalItem
      }
      realtimeCache.set(stationId, {
        expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
        value: byRouteId,
      })
      return byRouteId
    })
    .catch(() => ({}))
    .finally(() => {
      realtimeInFlight.delete(stationId)
    })

  realtimeInFlight.set(stationId, request)
  return request
}

async function fetchWithConcurrency(stationIds: string[]): Promise<Record<string, StationRealtimeMap>> {
  const result: Record<string, StationRealtimeMap> = {}
  let nextIndex = 0

  async function worker() {
    while (nextIndex < stationIds.length) {
      const index = nextIndex
      nextIndex += 1
      const stationId = stationIds[index]
      result[stationId] = await fetchStationRealtime(stationId)
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_REQUESTS, stationIds.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return result
}

/**
 * 결과에 포함된 승차 정류장별 실시간 도착 정보를 조회한다.
 * 동일 정류장은 한 번만 요청하고, 짧은 캐시와 최대 8개 동시 요청으로 API 호출을 제한한다.
 */
export default function useRealtimeArrival(stationIds: string[]): Record<string, StationRealtimeMap> {
  const stationKey = normalizeStationIds(stationIds).join('|')
  const normalizedStationIds = React.useMemo(
    () => (stationKey ? stationKey.split('|') : []),
    [stationKey],
  )
  const [byStationId, setByStationId] = React.useState<Record<string, StationRealtimeMap>>({})

  React.useEffect(() => {
    let cancelled = false
    if (normalizedStationIds.length === 0) {
      setByStationId({})
      return () => {
        cancelled = true
      }
    }

    fetchWithConcurrency(normalizedStationIds).then((next) => {
      if (!cancelled) setByStationId(next)
    })

    return () => {
      cancelled = true
    }
  }, [normalizedStationIds])

  return byStationId
}

