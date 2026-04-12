import { RealtimeArrivalItem, TimetableEntry } from '../types'
import { formatDisplayTime } from './timeUtils'
import { getServiceDayNowMinutes } from './timeUtils'

export function buildRealtimeKey(stationId?: string, routeId?: string, staOrder?: number | string | null): string {
  const sid = String(stationId || '').trim()
  const rid = String(routeId || '').trim()
  const so = String(staOrder ?? '').trim()
  return `${sid}|${rid}|${so}`
}

export function parseRealtimeItemResponse(payload: any): RealtimeArrivalItem | null {
  const item = payload?.item
  if (!item) return null
  const stationId = String(item.stationId || payload.stationId || '').trim()
  const routeId = String(item.routeId || payload.routeId || '').trim()
  if (!stationId || !routeId) return null
  const staOrderRaw = item.staOrder ?? payload.staOrder
  const staOrder = Number.isFinite(Number(staOrderRaw)) ? Number(staOrderRaw) : null
  const rawP1 = Number(item.predictTime1)
  const rawP2 = Number(item.predictTime2)
  const p1 = Number.isFinite(rawP1) && rawP1 > 0 ? rawP1 : null
  const p2 = Number.isFinite(rawP2) && rawP2 > 0 ? rawP2 : null
  return {
    stationId,
    routeId,
    staOrder,
    routeName: String(item.routeName || item.routeId || routeId),
    predictTime1: p1,
    predictTime2: p2,
    predictTimes: [p1, p2].filter((x): x is number => x != null),
  }
}

export function buildRealtimeEtaText(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(Number(min))) return '실시간 정보없음'
  const m = Math.max(0, Math.round(Number(min)))
  return `실시간 ${m}분`
}

export function buildRealtimeClockText(min: number | null | undefined, now: Date = new Date()): string {
  if (min == null || !Number.isFinite(Number(min))) return ''
  const rounded = Math.round(Number(min))
  if (rounded <= 0) return ''
  const nowMin = getServiceDayNowMinutes(now)
  const etaMin = nowMin + rounded
  const displayHour = Math.floor(etaMin / 60)
  const hh = String(displayHour).padStart(2, '0')
  const mm = String(etaMin % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function parseMinutesFromDisplay(text: string): number | null {
  const m = String(text || '').match(/^(\d+):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function getBestTimelineMinutes(entries: TimetableEntry[], sday: string, walkStartMin: number): number | null {
  const now = new Date()
  const earliest = getServiceDayNowMinutes(now) + Math.max(0, Math.floor(walkStartMin || 0))
  const candidate = (entries || [])
    .map((e) => {
      const t = formatDisplayTime(e.boardTime, sday)
      const m = parseMinutesFromDisplay(t)
      if (m == null) return null
      let mm = m
      while (mm < earliest) mm += 1440
      return mm
    })
    .filter((x): x is number => x != null)
    .sort((a, b) => a - b)[0]
  return candidate ?? null
}

export function shouldEmphasizeRealtime(bestTimelineMin: number | null, realtimeMin: number | null, thresholdMin = 7): boolean {
  if (bestTimelineMin == null || realtimeMin == null) return false
  const now = new Date()
  const nowMin = getServiceDayNowMinutes(now)
  const realtimeAbs = nowMin + realtimeMin
  return Math.abs(realtimeAbs - bestTimelineMin) >= thresholdMin
}

export function matchRealtimeToTimetableRows(
  boardTimes: string[],
  realtimeMins: number[],
  now: Date = new Date(),
): Array<number | null> {
  const toMinute = (t: string): number | null => {
    const m = String(t || '').match(/^(\d+):(\d{2})$/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }

  const times = boardTimes.map((t) => toMinute(t))
  const usedRows = new Set<number>()
  const result: Array<number | null> = Array.from({ length: boardTimes.length }).map(() => null)
  const nowMin = getServiceDayNowMinutes(now)
  const arrivals = (realtimeMins || [])
    .map((m) => Math.round(Number(m)))
    .filter((m) => Number.isFinite(m) && m > 0)
    .map((m) => nowMin + m)

  for (const eta of arrivals) {
    let pickRow = -1
    let bestDiff = Number.POSITIVE_INFINITY
    for (let i = 0; i < times.length; i += 1) {
      if (usedRows.has(i)) continue
      const t = times[i]
      if (t == null) continue
      const diff = Math.abs(t - eta)
      if (diff < bestDiff) {
        bestDiff = diff
        pickRow = i
      }
    }
    if (pickRow >= 0) {
      usedRows.add(pickRow)
      result[pickRow] = Math.max(0, Math.round(eta - nowMin))
    }
  }

  return result
}
