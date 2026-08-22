import React from 'react'

/** 정류장명이 11자 이상이면 10자까지만 보여주고 말줄임표를 붙인다. */
export function truncateStationName(name?: string | null): string {
  const trimmed = String(name || '').trim()
  return trimmed.length > 10 ? `${trimmed.slice(0, 10)}…` : trimmed
}

export function stationNameClass(name?: string | null): string {
  return String(name || '').trim().length >= 8 ? 'text-[9px]' : ''
}

export function StationNameTooltip({ name, className = '' }: { name?: string | null; className?: string }) {
  const fullName = String(name || '').trim()
  const [open, setOpen] = React.useState(false)
  const tooltipId = React.useId()

  if (!fullName) return <span className={className}>-</span>

  return (
    <span className="group relative inline-block max-w-full align-baseline">
      <button
        type="button"
        title={fullName}
        aria-label={`전체 정류장명: ${fullName}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className={`max-w-full cursor-help appearance-none border-0 bg-transparent p-0 text-left align-baseline ${className}`}
      >
        {truncateStationName(fullName)}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute left-0 top-full z-50 mt-1 max-w-[min(80vw,260px)] rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold leading-4 text-white shadow-lg transition-opacity ${
          open
            ? 'visible opacity-100'
            : 'invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100'
        }`}
      >
        {fullName}
      </span>
    </span>
  )
}
