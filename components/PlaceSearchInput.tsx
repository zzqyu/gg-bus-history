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
        {locating ? (
          <span className="inline-block h-5 w-5 rounded-full border-2 border-t-transparent border-slate-700 animate-spin" aria-hidden="true" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="inline-block h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M21 10c0 6-9 13-9 13S3 16 3 10a9 9 0 0118 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        )}
      </button>
      <button
        className="h-9 w-9 shrink-0 rounded border border-slate-300 text-base hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center"
        type="button"
        onClick={onSearch}
        aria-label={placeholder}
        title={placeholder}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </button>
    </div>
  )
}
