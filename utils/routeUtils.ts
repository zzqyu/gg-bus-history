import { Group, RouteBadgeInfo } from '../types'

export function compareRoutes(
  a: { routeName?: string; routeId?: string },
  b: { routeName?: string; routeId?: string }
): number {
  const na = String((a && (a.routeName || a.routeId)) || '').trim()
  const nb = String((b && (b.routeName || b.routeId)) || '').trim()

  // 노선 번호의 대시는 소수점처럼 취급한다. 예: 33-1 → 33.1,
  // 11-2 → 11.2. H105처럼 숫자와 글자가 섞인 경우에도 숫자 부분을 기준으로
  // 정렬한다.
  const getNumericRouteValue = (name: string): number | null => {
    const match = name.match(/(\d+)(?:-(\d+))?/)
    if (!match) return null
    const value = match[2] == null ? Number(match[1]) : Number(`${match[1]}.${match[2]}`)
    return Number.isFinite(value) ? value : null
  }

  const va = getNumericRouteValue(na)
  const vb = getNumericRouteValue(nb)
  if (va != null && vb != null && va !== vb) return va - vb
  if (va != null && vb == null) return -1
  if (va == null && vb != null) return 1
  return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' })
}

export function getGroupKey(g: Group): string {
  return g.board.stationId + '-' + g.alight.stationId
}

export function getGroupRouteBadges(g: Group): RouteBadgeInfo[] {
  const seen = new Set<string>()
  const out: RouteBadgeInfo[] = []
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
