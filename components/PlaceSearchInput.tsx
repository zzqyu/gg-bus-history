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
      <div className="relative min-w-0 flex-1">
        <input
          className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2 pr-8 py-1 text-sm text-foreground sm:text-base"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="입력 내용 지우기"
            title="입력 내용 지우기"
            className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>
      <button
        className="btn-ui-icon shrink-0 text-base disabled:opacity-50"
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
        className="btn-ui-icon shrink-0 text-base disabled:opacity-50 flex items-center justify-center"
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
