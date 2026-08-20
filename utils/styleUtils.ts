const SEAT_DISPLAY_ROUTE_TYPE_CODES = new Set(['11', '12', '14', '16', '21', '22', '42'])

export function canDisplaySeatCount(routeTypeCd?: string): boolean {
  // 좌석 미표시 노선은 Phase 3에서 혼잡도로 대체 표시한다.
  return SEAT_DISPLAY_ROUTE_TYPE_CODES.has(String(routeTypeCd || '').trim())
}

export function getRouteTypeClass(routeTypeCd?: string): string {
  const code = String(routeTypeCd || '').trim()
  if (code === '11' || code === '14' || code === '16' || code === '21') return 'text-route-express font-bold'
  if (code === '12' || code === '22' || code === '42') return 'text-route-seat font-bold'
  if (code === '13' || code === '23') return 'text-route-normal font-bold'
  if (code === '30') return 'text-route-village font-bold'
  if (code === '15') return 'text-route-etc font-bold'
  return 'text-route-unknown font-bold'
}

export function getRouteTypeLabel(routeTypeCd?: string): string {
  const code = String(routeTypeCd || '').trim()
  if (code === '11' || code === '21') return '직행좌석'
  if (code === '12' || code === '22') return '좌석'
  if (code === '13') return '일반시내'
  if (code === '14') return '광역급행'
  if (code === '15') return '기타'
  if (code === '16') return '경기순환'
  if (code === '23') return '일반'
  if (code === '30') return '마을'
  if (code === '42') return '시외좌석'
  return ''
}
