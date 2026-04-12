import { Group, StationNumberMaps } from '../types'

interface StationIndexSeed {
  stationId: string
  stationName: string
  distance: number
}

export function createEmptyStationNumberMaps(): StationNumberMaps {
  return {
    boardByStationId: {},
    boardByStationName: {},
    alightByStationId: {},
    alightByStationName: {},
  }
}

function normalizeText(v: unknown): string {
  return String(v || '').trim()
}

function stationDistance(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

function buildIndex(entries: StationIndexSeed[]): { byStationId: Record<string, number>; byStationName: Record<string, number> } {
  const uniqueByKey = new Map<string, StationIndexSeed>()
  for (const item of entries) {
    const sid = normalizeText(item.stationId)
    const sname = normalizeText(item.stationName)
    if (!sid && !sname) continue
    const dedupKey = sid || `name:${sname}`
    const prev = uniqueByKey.get(dedupKey)
    if (!prev) {
      uniqueByKey.set(dedupKey, item)
      continue
    }
    if (item.distance < prev.distance) uniqueByKey.set(dedupKey, item)
  }

  const sorted = Array.from(uniqueByKey.values()).sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance
    return normalizeText(a.stationName).localeCompare(normalizeText(b.stationName), 'en', { sensitivity: 'base' })
  })

  const byStationId: Record<string, number> = {}
  const byStationName: Record<string, number> = {}
  for (let i = 0; i < sorted.length; i += 1) {
    const no = i + 1
    const sid = normalizeText(sorted[i].stationId)
    const sname = normalizeText(sorted[i].stationName)
    if (sid && byStationId[sid] == null) byStationId[sid] = no
    if (sname && byStationName[sname] == null) byStationName[sname] = no
  }

  return { byStationId, byStationName }
}

export function buildStationNumberMaps(groups: Group[], selectedRouteIds: string[] = []): StationNumberMaps {
  const groupList = Array.isArray(groups) ? groups : []
  const routeSet = new Set((selectedRouteIds || []).map((x) => normalizeText(x)).filter(Boolean))

  const filtered = routeSet.size > 0
    ? groupList.filter((g) => (g.routes || []).some((r) => routeSet.has(normalizeText(r.routeId))))
    : groupList

  const boardSeed: StationIndexSeed[] = []
  const alightSeed: StationIndexSeed[] = []

  for (const g of filtered) {
    const board = g?.board
    const alight = g?.alight
    if (board) {
      boardSeed.push({
        stationId: normalizeText(board.stationId),
        stationName: normalizeText(board.stationName),
        distance: stationDistance((board as any).dist),
      })
    }
    if (alight) {
      alightSeed.push({
        stationId: normalizeText(alight.stationId),
        stationName: normalizeText(alight.stationName),
        distance: stationDistance((alight as any).dist),
      })
    }
  }

  const boardIndex = buildIndex(boardSeed)
  const alightIndex = buildIndex(alightSeed)

  return {
    boardByStationId: boardIndex.byStationId,
    boardByStationName: boardIndex.byStationName,
    alightByStationId: alightIndex.byStationId,
    alightByStationName: alightIndex.byStationName,
  }
}

export function getBoardStationNumber(maps: StationNumberMaps, stationId?: string, stationName?: string): number | null {
  const sid = normalizeText(stationId)
  if (sid && maps.boardByStationId[sid] != null) return maps.boardByStationId[sid]
  const sname = normalizeText(stationName)
  if (sname && maps.boardByStationName[sname] != null) return maps.boardByStationName[sname]
  return null
}

export function getAlightStationNumber(maps: StationNumberMaps, stationId?: string, stationName?: string): number | null {
  const sid = normalizeText(stationId)
  if (sid && maps.alightByStationId[sid] != null) return maps.alightByStationId[sid]
  const sname = normalizeText(stationName)
  if (sname && maps.alightByStationName[sname] != null) return maps.alightByStationName[sname]
  return null
}
