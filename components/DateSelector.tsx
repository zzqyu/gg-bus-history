import React from 'react'
import { DateBounds } from '../types'

interface DateSelectorProps {
  sday: string
  dateBounds: DateBounds
  quickDay1: string
  quickDay2: string
  quickDay7: string
  onSdayChange: (v: string) => void
  onQuickDay: (daysAgo: number) => void
}

export default function DateSelector({
  sday,
  dateBounds,
  quickDay1,
  quickDay2,
  quickDay7,
  onSdayChange,
  onQuickDay,
}: DateSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <div className="flex flex-wrap items-center">
        <label className="mr-2">
          <strong>날짜:</strong>
        </label>
        <input
          type="date"
          value={sday}
          min={dateBounds.min || undefined}
          max={dateBounds.max || undefined}
          onChange={(e) => onSdayChange(e.target.value)}
          className="mr-2 rounded border border-slate-300 px-2 py-1"
        />
      </div>
      <div className="flex flex-wrap items-center gap-0">
        <button
          className="rounded border border-slate-300 text-sm px-2 py-1 hover:bg-slate-50"
          style={sday === quickDay1 ? { backgroundColor: '#e8f0ff' } : undefined}
          type="button"
          onClick={() => onQuickDay(1)}
        >
          1일전
        </button>
        <button
          className="rounded border border-slate-300 text-sm px-2 py-1 hover:bg-slate-50"
          style={sday === quickDay2 ? { backgroundColor: '#e8f0ff' } : undefined}
          type="button"
          onClick={() => onQuickDay(2)}
        >
          2일전
        </button>
        <button
          className="rounded border border-slate-300 text-sm px-2 py-1 hover:bg-slate-50"
          style={sday === quickDay7 ? { backgroundColor: '#e8f0ff' } : undefined}
          type="button"
          onClick={() => onQuickDay(7)}
        >
          1주전
        </button>
      </div>
    </div>
  )
}
