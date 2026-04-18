import React from 'react'

const SEAT_DISPLAY_ROUTE_TYPE_CODES = new Set(['11', '12', '14', '16', '21', '22', '42'])

export function canDisplaySeatCount(routeTypeCd?: string): boolean {
  return SEAT_DISPLAY_ROUTE_TYPE_CODES.has(String(routeTypeCd || '').trim())
}

export function getRouteNameStyle(routeTypeCd?: string): React.CSSProperties {
  const code = String(routeTypeCd || '').trim()
  if (code === '16') return { color: '#e60012', fontWeight: 700 }
  if (code === '11' || code === '14' || code === '21') return { color: '#e60012', fontWeight: 700 }
  if (code === '12' || code === '22' || code === '42') return { color: '#0068b7', fontWeight: 700 }
  if (code === '13' || code === '23') return { color: '#33CC99', fontWeight: 700 }
  if (code === '30') return { color: '#ffc600', fontWeight: 700 }
  if (code === '15') return { color: '#bb2266', fontWeight: 700 }
  return { color: '#6b7280', fontWeight: 700 }
}
