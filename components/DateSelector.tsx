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
    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
      <div className="flex flex-wrap items-center">
        <label className="mr-2 text-xs sm:text-sm">
          <strong>날짜:</strong>
        </label>
        <input
          type="date"
          value={sday}
          min={dateBounds.min || undefined}
          max={dateBounds.max || undefined}
          onChange={(e) => onSdayChange(e.target.value)}
          className="mr-2 h-10 sm:h-11 rounded border border-slate-300 px-2.5 sm:px-3 text-sm sm:text-base"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          className="h-9 sm:h-10 rounded border border-slate-300 px-2.5 sm:px-3 text-xs sm:text-sm font-semibold hover:bg-slate-50"
          style={sday === quickDay1 ? { backgroundColor: '#dbeafe', borderColor: '#60a5fa', color: '#1d4ed8' } : undefined}
          type="button"
          onClick={() => onQuickDay(1)}
        >
          1일전
        </button>
        <button
          className="h-9 sm:h-10 rounded border border-slate-300 px-2.5 sm:px-3 text-xs sm:text-sm font-semibold hover:bg-slate-50"
          style={sday === quickDay2 ? { backgroundColor: '#dbeafe', borderColor: '#60a5fa', color: '#1d4ed8' } : undefined}
          type="button"
          onClick={() => onQuickDay(2)}
        >
          2일전
        </button>
        <button
          className="h-9 sm:h-10 rounded border border-slate-300 px-2.5 sm:px-3 text-xs sm:text-sm font-semibold hover:bg-slate-50"
          style={sday === quickDay7 ? { backgroundColor: '#dbeafe', borderColor: '#60a5fa', color: '#1d4ed8' } : undefined}
          type="button"
          onClick={() => onQuickDay(7)}
        >
          1주전
        </button>
      </div>
    </div>
  )
}
