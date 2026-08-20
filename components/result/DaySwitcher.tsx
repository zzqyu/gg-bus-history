import React from 'react'
import { getDateBounds, getQuickDayValue, clampDateValue } from '../../utils/timeUtils'
import type { DateBounds } from '../../types'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface PresetOption {
  key: string
  label: string
  daysAgo: number
}

const PRESETS: PresetOption[] = [
  { key: 'lastWeek', label: '지난주 같은 요일', daysAgo: 7 },
  { key: 'yesterday', label: '어제', daysAgo: 1 },
  { key: 'twoWeeksAgo', label: '2주 전 같은 요일', daysAgo: 14 },
]

export function formatDateLabel(value: string): string {
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  const weekday = WEEKDAY_LABELS[d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}(${weekday})`
}

/** 기본 조회일 — "지난주 같은 요일"(사용자 결정, plans/ui-ux/artifacts/PREVIEW-RESEARCH-COMPARISON.md
 * "최종 결정" 절 참고). 최초 검색 시 이 값으로 groupTimetable/allGroupsTimetable을 호출한다. */
export function getDefaultSday(): string {
  return getQuickDayValue(7, getDateBounds())
}

interface DaySwitcherProps {
  /** 현재 선택된 기준일(YYYY-MM-DD). 부모(검색 상태)가 소유한다 — 이 컴포넌트는 controlled. */
  value: string
  onChange: (sday: string) => void
}

/**
 * 기준일 전환 컨트롤(P3-T15에서 설계, P4-T0a에서 실제 데이터에 연결). 기본은 "지난주 같은 요일"
 * (`getDefaultSday()`), 그 외 "어제"/"2주 전 같은 요일"/"직접 선택"으로 전환할 수 있다. 결과 카드
 * 화면과 시간이력 화면 양쪽에서 재사용한다.
 */
export default function DaySwitcher({ value, onChange }: DaySwitcherProps) {
  const bounds: DateBounds = React.useMemo(() => getDateBounds(), [])
  const presetValues = React.useMemo(
    () => PRESETS.map((p) => ({ ...p, value: getQuickDayValue(p.daysAgo, bounds) })),
    [bounds]
  )
  const matchedPreset = presetValues.find((p) => p.value === value)
  const selectedLabel = matchedPreset ? matchedPreset.label : '직접 선택'
  const [customOpen, setCustomOpen] = React.useState(!matchedPreset)

  React.useEffect(() => {
    if (matchedPreset) setCustomOpen(false)
  }, [matchedPreset])

  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className="text-sm font-bold text-foreground">기준일 {formatDateLabel(value)}</span>
        <span className="text-xs font-medium text-muted-foreground">· {selectedLabel}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {presetValues.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              onChange(p.value)
              setCustomOpen(false)
            }}
            aria-pressed={p.value === value}
            className={`touch-target min-h-9 rounded-full border px-3 text-xs font-semibold transition ${
              p.value === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((open) => !open)}
          aria-pressed={!matchedPreset}
          className={`touch-target min-h-9 rounded-full border px-3 text-xs font-semibold transition ${
            !matchedPreset
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-foreground hover:bg-muted'
          }`}
        >
          직접 선택
        </button>
      </div>

      {customOpen && (
        <div className="mt-1.5">
          <input
            type="date"
            aria-label="기준일 직접 선택"
            min={bounds.min}
            max={bounds.max}
            value={value}
            onChange={(ev) => onChange(clampDateValue(ev.target.value, bounds.min, bounds.max))}
            className="min-h-9 rounded-lg border border-input bg-background px-2 text-sm font-semibold"
          />
        </div>
      )}
    </div>
  )
}
