import React from 'react'

interface PlaceSearchInputProps {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onLocate: () => void
  placeholder: string
  locating?: boolean
}

export default function PlaceSearchInput({
  value,
  onChange,
  onSearch,
  onKeyDown,
  onLocate,
  placeholder,
  locating = false,
}: PlaceSearchInputProps) {
  return (
    <div className="flex items-center">
      <input
        className="h-9 min-w-0 flex-1 rounded border border-slate-300 px-2 py-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
      <button
        className="h-9 w-9 shrink-0 rounded border border-slate-300 text-base hover:bg-slate-50 disabled:opacity-50"
        type="button"
        onClick={onLocate}
        disabled={locating}
        aria-label="현재 위치로 설정"
        title="현재 위치로 설정"
      >
        {locating ? '⏳' : '📍'}
      </button>
      <button
        className="h-9 w-9 shrink-0 rounded border border-slate-300 text-base hover:bg-slate-50 disabled:opacity-50"
        type="button"
        onClick={onSearch}
        aria-label={placeholder}
        title={placeholder}
      >
        🔍
      </button>
    </div>
  )
}
