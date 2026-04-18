import React from 'react'
import { KakaoPlace } from '../types'

interface SearchResultsPanelProps {
  title: string
  message: string
  results: KakaoPlace[]
  onSelect: (place: KakaoPlace) => void
}

export default function SearchResultsPanel({
  title,
  message,
  results,
  onSelect,
}: SearchResultsPanelProps) {
  return (
    <div className="min-h-[90px] rounded border border-slate-200 bg-white p-2">
      <div className="mb-1.5 font-bold">{title}</div>
      {message && <div className="mb-1.5 text-slate-600 text-sm">{message}</div>}
      <ul className="m-0 max-h-[140px] overflow-auto pl-[18px]">
        {results.map((p, idx) => (
          <li key={idx} className="mb-1.5">
            <button
              type="button"
              className="text-left text-sm hover:underline"
              onClick={() => onSelect(p)}
            >
              {p.place_name || p.address_name || '선택'}
            </button>
            <div className="text-xs text-slate-600">
              {p.address_name || p.road_address_name || ''}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
