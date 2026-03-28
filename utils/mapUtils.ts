export function toCoordString(v: number | string): string {
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return n.toFixed(6)
}

export function parseCoordValue(v: unknown): number {
  if (v == null) return Number.NaN
  const s = String(v).trim()
  if (!s) return Number.NaN
  const n = Number(s)
  return Number.isFinite(n) ? n : Number.NaN
}

export function getPlaceDisplayText(place: {
  place_name?: string
  address_name?: string
  road_address_name?: string
}): string {
  if (!place) return ''
  const text = place.place_name || place.address_name || place.road_address_name || ''
  return String(text).trim()
}
