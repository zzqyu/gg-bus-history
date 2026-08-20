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
  const remainSeatCnt1 = Number.isFinite(Number(item.remainSeatCnt1)) ? Number(item.remainSeatCnt1) : null
  const remainSeatCnt2 = Number.isFinite(Number(item.remainSeatCnt2)) ? Number(item.remainSeatCnt2) : null
  const congestion1 = Number.isFinite(Number(item.congestion1)) ? Number(item.congestion1) : null
  const congestion2 = Number.isFinite(Number(item.congestion2)) ? Number(item.congestion2) : null
  const locationNo1 = Number.isFinite(Number(item.locationNo1)) ? Number(item.locationNo1) : null
  const locationNo2 = Number.isFinite(Number(item.locationNo2)) ? Number(item.locationNo2) : null
  const lowPlate1 = item.lowPlate1 != null ? String(item.lowPlate1) : null
  const lowPlate2 = item.lowPlate2 != null ? String(item.lowPlate2) : null
  return {
    stationId,
    routeId,
    staOrder,
    routeName: String(item.routeName || item.routeId || routeId),
    predictTime1: p1,
    predictTime2: p2,
    predictTimes: [p1, p2].filter((x): x is number => x != null),
    remainSeatCnt1,
    remainSeatCnt2,
    congestion1,
    congestion2,
    locationNo1,
    locationNo2,
    lowPlate1,
    lowPlate2,
  }
}

/** "3정거장 전" 형태의 텍스트. 값이 없으면 빈 문자열. */
export function buildRealtimeLocationText(item: RealtimeArrivalItem | null | undefined, predictIndex: 1 | 2 = 1): string {
  if (!item) return ''
  const n = predictIndex === 1 ? item.locationNo1 : item.locationNo2
  if (n == null || !Number.isFinite(Number(n)) || Number(n) < 0) return ''
  return `${Math.round(Number(n))}정거장 전`
}

/** 저상버스 여부. 백엔드는 '1'이면 저상, 그 외(빈 문자열 등)는 일반차량. */
export function isLowFloorBus(item: RealtimeArrivalItem | null | undefined, predictIndex: 1 | 2 = 1): boolean {
  if (!item) return false
  const v = predictIndex === 1 ? item.lowPlate1 : item.lowPlate2
  return String(v || '').trim() === '1'
}

function getCongestionLabel(level: number | null | undefined): string {
  if (level == null || !Number.isFinite(Number(level))) return ''
  const n = Math.round(Number(level))
  if (n <= 1) return '여유'
  if (n === 2) return '보통'
  if (n === 3) return '혼잡'
  return '매우혼잡'
}

export function buildRealtimeOccupancyText(item: RealtimeArrivalItem | null | undefined, predictIndex: 1 | 2 = 1): string {
  if (!item) return ''
  const seat = predictIndex === 1 ? item.remainSeatCnt1 : item.remainSeatCnt2
  if (seat != null && Number.isFinite(Number(seat)) && Number(seat) >= 0) {
    return `${Math.round(Number(seat))}석`
  }
  const congestion = predictIndex === 1 ? item.congestion1 : item.congestion2
  return getCongestionLabel(congestion)
}

/** 좌석수 미표시 노선(마을·일반시내 등)용 — 좌석수 없이 혼잡도만 표시한다. */
export function buildRealtimeCongestionText(item: RealtimeArrivalItem | null | undefined, predictIndex: 1 | 2 = 1): string {
  if (!item) return ''
  const congestion = predictIndex === 1 ? item.congestion1 : item.congestion2
  return getCongestionLabel(congestion)
}

/** 좌석/혼잡도를 색으로도 구분한다(재량 항목 — GBIS 좌석 색상코딩 참고).
 * 혼잡도는 노선 유형 색 토큰을 재사용한다(사용자 지정): 여유=일반시내색(route-normal, 초록),
 * 보통=마을버스색(route-village, 원래 노란색이었다가 라이트 모드 WCAG AA 대비 때문에 어둡게
 * 조정된 톤 — 다크 모드에서는 실제 노란색으로 보인다), 혼잡=광역버스색(route-express, 빨강).
 * 좌석수는 잔여석 기준 별도 배색을 유지한다. seatEligible이 false면 API가 remainSeatCnt를
 * 내려주더라도(표시는 혼잡도 텍스트) 좌석 배색을 쓰지 않는다 — buildRealtimeOccupancyText/
 * buildRealtimeCongestionText의 표시 텍스트 선택 기준과 반드시 맞춰야 한다. */
export function getOccupancyTone(
  item?: RealtimeArrivalItem | null,
  predictIndex: 1 | 2 = 1,
  seatEligible = true,
): string {
  const seat = seatEligible ? (predictIndex === 1 ? item?.remainSeatCnt1 : item?.remainSeatCnt2) : null
  if (seat != null && Number.isFinite(Number(seat))) {
    const n = Number(seat)
    if (n <= 0) return 'text-red-600 dark:text-red-400'
    if (n <= 5) return 'text-amber-600 dark:text-amber-400'
    return 'text-emerald-600 dark:text-emerald-400'
  }
  const congestion = Number(predictIndex === 1 ? item?.congestion1 : item?.congestion2)
  if (!Number.isFinite(congestion)) return 'text-muted-foreground'
  if (congestion >= 3) return 'text-route-express'
  if (congestion === 2) return 'text-route-village'
  return 'text-route-normal'
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
