import { Group, RouteBadgeInfo } from '../types'

export function compareRoutes(
  a: { routeName?: string; routeId?: string },
  b: { routeName?: string; routeId?: string }
): number {
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
