import { DateBounds } from '../types'

export function formatDateInput(d: Date): string {
  const y = String(d.getFullYear())
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getDateBounds(): DateBounds {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() - 1)
  const minDate = new Date(today)
  minDate.setDate(minDate.getDate() - 15)
  return {
    min: formatDateInput(minDate),
    max: formatDateInput(maxDate),
  }
}

export function clampDateValue(v: string, min: string, max: string): string {
  if (!v) return v
  if (min && v < min) return min
  if (max && v > max) return max
  return v
}

export function getQuickDayValue(daysAgo: number, bounds: DateBounds): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return clampDateValue(formatDateInput(d), bounds.min, bounds.max)
}

export function formatDuration(boardTime?: string, alightTime?: string): string {
  if (!boardTime || !alightTime) return '-'
  const b = new Date(String(boardTime).replace(' ', 'T'))
  const a = new Date(String(alightTime).replace(' ', 'T'))
  if (Number.isNaN(b.getTime()) || Number.isNaN(a.getTime())) return '-'
  const diffMin = Math.floor((a.getTime() - b.getTime()) / 60000)
  if (diffMin < 0) return '-'
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

export function formatDisplayTime(dateTime?: string, queryDay?: string): string {
  if (!dateTime) return '-'
  const s = String(dateTime).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/)
  if (!m) return s

  const datePart = m[1] + '-' + m[2] + '-' + m[3]
  let hour = Number(m[4])
  const minute = m[5]

  if (queryDay) {
    const p = String(queryDay).split('-').map(Number)
    if (p.length === 3) {
      const next = new Date(p[0], p[1] - 1, p[2] + 1)
      const ny = String(next.getFullYear())
      const nm = String(next.getMonth() + 1).padStart(2, '0')
      const nd = String(next.getDate()).padStart(2, '0')
      const nextDay = ny + '-' + nm + '-' + nd
      if (datePart === nextDay) {
        hour += 24
      }
    }
  }

  return String(hour).padStart(2, '0') + ':' + minute
}
