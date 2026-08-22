import React from 'react'
import type { DateBounds, RealtimeArrivalItem, TimetableEntry } from '../../types'
import {
  clampDateValue,
  formatDisplayTime,
  formatDuration,
  getDateBounds,
  getQuickDayValue,
  getServiceDayNowMinutes,
} from '../../utils/timeUtils'
import { canDisplaySeatCount, getRouteTypeClass, getRouteTypeLabel } from '../../utils/styleUtils'
import {
  buildRealtimeClockText,
  buildRealtimeCongestionText,
  buildRealtimeOccupancyText,
  getOccupancyTone,
} from '../../utils/realtimeUtils'
import GlossarySheet from './GlossarySheet'
import RouteBadge from './RouteBadge'
import { compareRoutes } from '../../utils/routeUtils'
import { StationNameTooltip, stationNameClass } from './StationNameTooltip'

type DatePresetKey = 'lastWeek' | 'yesterday' | 'twoWeeksAgo'

interface DatePreset {
  key: DatePresetKey
  label: string
  daysAgo: number
}

const DATE_PRESETS: DatePreset[] = [
  { key: 'lastWeek', label: '지난주 같은 요일', daysAgo: 7 },
  { key: 'yesterday', label: '어제', daysAgo: 1 },
  { key: 'twoWeeksAgo', label: '2주 전 같은 요일', daysAgo: 14 },
]

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export interface DateBasisControlProps {
  value: string
  onChange: (sday: string) => void
}

export interface TimetableViewProps {
  combined: TimetableEntry[]
  sday: string
  onChange: (sday: string) => void
  realtimeByStationId?: Record<string, Record<string, RealtimeArrivalItem>>
  /** true면 컴포넌트 내부의 DateBasisControl을 안 그린다. 프로덕션(pages/index.tsx)처럼
   * 바깥에 이미 동일한 역할의 날짜 컨트롤(DaySwitcher)이 있을 때 중복 노출을 막는 용도.
   * 기본값 false — /preview 등 기존 사용처는 그대로 내부 컨트롤을 계속 보여준다. */
  hideDateBasisControl?: boolean
}

export function formatDateLabel(value: string): string {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return value

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const weekday = WEEKDAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${month}/${day}(${weekday})`
}

function parseClock(text: string): number | null {
  const match = String(text).match(/^(\d+):(\d{2})$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function formatBusDuration(entry: TimetableEntry | null): string {
  if (!entry) return '-'
  const value = formatDuration(entry.boardTime, entry.alightTime)
  if (value === '-') return value

  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '-'
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`
}

function confidenceText(confidence?: string | null): string {
  const value = String(confidence || '').trim().toLowerCase()
  if (value === 'high') return '높음'
  if (value === 'medium' || value === 'mid') return '보통'
  if (value === 'low') return '낮음'
  return value || '-'
}

function getPresetValue(preset: DatePreset, bounds: DateBounds): string {
  return getQuickDayValue(preset.daysAgo, bounds)
}

export function DateBasisControl({ value, onChange }: DateBasisControlProps) {
  const bounds = React.useMemo(() => getDateBounds(), [])
  const matchingPreset = DATE_PRESETS.find((preset) => getPresetValue(preset, bounds) === value)
  const [customOpen, setCustomOpen] = React.useState(() => matchingPreset == null)
  const activePreset = customOpen ? undefined : matchingPreset
  const activeLabel = activePreset?.label || '직접 선택'

  React.useEffect(() => {
    if (matchingPreset) setCustomOpen(false)
  }, [matchingPreset])

  return (
    <section
      data-date-basis-control
      className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4"
      aria-label="기준일 전환"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-foreground" aria-live="polite">
          기준일: <span data-date-basis-label className="text-primary">{formatDateLabel(value)}</span> · {activeLabel}
        </p>
        <p className="text-xs text-muted-foreground">기본값은 평일·주말 패턴을 맞춘 지난주 같은 요일입니다.</p>
      </div>

      <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1">
        {DATE_PRESETS.map((preset) => {
          const value = getPresetValue(preset, bounds)
          const selected = activePreset?.key === preset.key
          return (
            <button
              key={preset.key}
              type="button"
              data-date-preset={preset.key}
              aria-pressed={selected}
              onClick={() => {
                setCustomOpen(false)
                onChange(value)
              }}
              className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-bold ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {preset.label} · {formatDateLabel(value)}
            </button>
          )
        })}
        <button
          type="button"
          data-date-preset="custom"
          aria-pressed={activePreset == null}
          onClick={() => setCustomOpen(true)}
          className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-bold ${
            activePreset == null
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-foreground hover:bg-muted'
          }`}
        >
          직접 선택
        </button>
      </div>

      {activePreset == null && (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
          직접 선택할 기준일
          <input
            type="date"
            aria-label="기준일 직접 선택"
            min={bounds.min}
            max={bounds.max}
            value={value}
            onChange={(event) => {
              const nextValue = event.target.value
              if (nextValue) onChange(clampDateValue(nextValue, bounds.min, bounds.max))
            }}
            className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm font-bold text-foreground"
          />
        </label>
      )}

      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
        날짜를 바꾸면 선택한 기준일의 운행 이력을 다시 조회합니다.
      </p>
    </section>
  )
}

export function ConfidenceBadge({ entry }: { entry: TimetableEntry | null }) {
  if (!entry?.inferred) return null
  return (
    <span
      title={`추정 방식: ${entry.inference_method || '-'}`}
      className="inline-flex rounded-full border border-badge-inferred-border bg-badge-inferred-bg px-2.5 py-1 text-xs font-bold text-badge-inferred-fg"
    >
      하차시각 추정 · 신뢰도 {confidenceText(entry.inference_confidence)}
    </span>
  )
}

export function TimetableRow({
  entry,
  sday,
  highlighted,
  realtimeItem,
  realtimePredictIndex = 1,
  rowRef,
}: {
  entry: TimetableEntry
  sday: string
  highlighted: boolean
  realtimeItem?: RealtimeArrivalItem | null
  realtimePredictIndex?: 1 | 2
  rowRef?: (el: HTMLLIElement | null) => void
}) {
  const boardText = formatDisplayTime(entry.boardTime, sday)
  const alightText = formatDisplayTime(entry.alightTime, sday)
  const typeLabel = getRouteTypeLabel(entry.routeTypeCd)

  // 좌석수는 좌석/직행좌석/광역급행 등 좌석 데이터가 유효한 노선에서만, 그 외는 혼잡도만.
  // realtimeItem은 이 행의 승차시각과 가장 가까운 실시간 예측 하나만 연결된 상태로 전달받는다
  // (같은 노선의 다른 시간이력 행에는 중복으로 붙지 않는다 — TimetableView의 매칭 로직 참고).
  const seatEligible = canDisplaySeatCount(entry.routeTypeCd)
  const occupancyText = seatEligible
    ? buildRealtimeOccupancyText(realtimeItem, realtimePredictIndex)
    : buildRealtimeCongestionText(realtimeItem, realtimePredictIndex)
  const occupancyTone = getOccupancyTone(realtimeItem, realtimePredictIndex, seatEligible)
  const realtimeClockText = buildRealtimeClockText(
    realtimePredictIndex === 1 ? realtimeItem?.predictTime1 : realtimeItem?.predictTime2
  )

  return (
    <li
      ref={rowRef}
      className={`relative grid min-w-0 grid-cols-[64px_minmax(0,0.65fr)_minmax(0,0.9fr)] gap-1.5 border-b border-border px-3 py-3 sm:grid-cols-[84px_minmax(130px,0.65fr)_minmax(0,0.9fr)] sm:px-5 sm:py-4 ${
        highlighted ? 'bg-primary/10' : 'bg-card'
      }`}
    >
      <div className="relative w-16 shrink-0 text-center sm:w-auto">
        <span
          className={`relative z-[1] inline-flex min-h-9 min-w-14 items-center justify-center rounded-xl px-2 text-base font-extrabold tabular-nums ${
            highlighted ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
          }`}
        >
          {boardText}
        </span>
        {realtimeClockText && (
          <span className="relative z-[1] mt-1 block text-[10px] font-bold text-badge-realtime-fg">
            실시간 {realtimeClockText}
          </span>
        )}

        {occupancyText && <span className={`text-xs font-semibold ${occupancyTone}`}>{occupancyText}</span>}

      </div>

      {/* 정류장명은 11자부터 축약하므로 모바일에서도 노선 정보와 목적지 예상 영역을
          같은 행의 세 번째 열에 배치한다. */}
      <div className="contents">
        <div className="col-start-2 min-w-0 self-start sm:pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-base font-extrabold ${getRouteTypeClass(entry.routeTypeCd)}`}>
              {entry.routeName || entry.routeId || '-'}
            </span>
            {typeLabel && <span className="text-xs font-semibold text-muted-foreground">{typeLabel}</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            <StationNameTooltip name={entry.boardStationName} className={stationNameClass(entry.boardStationName)} />
          </p>
        </div>

        <div className="col-start-3 min-w-0 self-start rounded-xl border border-primary/20 bg-primary/5 p-2 sm:col-start-3 sm:row-start-1 sm:p-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
            <div className="min-w-0">
              <p className="whitespace-nowrap text-xs font-bold text-primary">
                <StationNameTooltip name={entry.alightStationName} className={stationNameClass(entry.alightStationName)} />
              </p>
              <p className="mt-0.5 text-base font-extrabold tabular-nums text-primary">{alightText}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold">{formatBusDuration(entry)}</p>
              <p className="text-[10px] text-muted-foreground">{entry.orderGap ?? '-'}정거장</p>
            </div>
          </div>
          {entry.inferred && (
            <div className="mt-2">
              <ConfidenceBadge entry={entry} />
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export default function TimetableView({ combined, sday, onChange, realtimeByStationId = {}, hideDateBasisControl = false }: TimetableViewProps) {
  const entries = Array.isArray(combined) ? combined : []
  const [selectedRouteIdState, setSelectedRouteId] = React.useState<string | null>(null)

  const routeEntries = React.useMemo(() => {
    const routes = new Map<string, TimetableEntry>()
    for (const entry of entries) {
      const routeId = String(entry.routeId || '').trim()
      if (routeId && !routes.has(routeId)) routes.set(routeId, entry)
    }
    return Array.from(routes.values()).sort(compareRoutes)
  }, [entries])

  const selectedRouteId = routeEntries.some(
    (entry) => String(entry.routeId || '') === selectedRouteIdState,
  )
    ? selectedRouteIdState
    : null

  const filtered = React.useMemo(
    () => selectedRouteId
      ? entries.filter((entry) => String(entry.routeId || '') === selectedRouteId)
      : entries,
    [entries, selectedRouteId],
  )

  const highlightedIndex = React.useMemo(() => {
    if (filtered.length === 0) return -1
    const nowMinutes = getServiceDayNowMinutes()
    const nextIndex = filtered.findIndex((entry) => {
      const minutes = parseClock(formatDisplayTime(entry.boardTime, sday))
      return minutes != null && minutes >= nowMinutes
    })
    return nextIndex >= 0 ? nextIndex : filtered.length - 1
  }, [filtered, sday])

  const nextEntry = highlightedIndex >= 0 ? filtered[highlightedIndex] : null

  // 실시간 예측을 같은 노선의 여러 시간이력 행에 전부 붙이면 어느 버스인지 헷갈린다.
  // 승차시각이 가장 가까운 행 하나에만 매칭해서 붙인다(정류장+노선별로 최대 2개 예측을 그리디 매칭).
  const realtimeMatchByIndex = React.useMemo(() => {
    const nowMin = getServiceDayNowMinutes()
    const groups = new Map<string, number[]>()
    filtered.forEach((entry, idx) => {
      const key = `${entry.boardStationId || ''}|${entry.routeId || ''}`
      const list = groups.get(key)
      if (list) list.push(idx)
      else groups.set(key, [idx])
    })

    const result = new Map<number, 1 | 2>()
    for (const [key, indices] of groups) {
      const [stationId, routeId] = key.split('|')
      const item = realtimeByStationId[stationId]?.[routeId]
      if (!item) continue

      const rows = indices
        .map((idx) => ({ idx, boardMin: parseClock(formatDisplayTime(filtered[idx].boardTime, sday)) }))
        .filter((r): r is { idx: number; boardMin: number } => r.boardMin != null)

      const candidates: Array<{ predictIndex: 1 | 2; etaMin: number }> = []
      if (item.predictTime1 != null) candidates.push({ predictIndex: 1, etaMin: nowMin + Math.round(item.predictTime1) })
      if (item.predictTime2 != null) candidates.push({ predictIndex: 2, etaMin: nowMin + Math.round(item.predictTime2) })

      const usedRows = new Set<number>()
      for (const candidate of candidates) {
        let bestIdx = -1
        let bestDiff = Infinity
        for (const row of rows) {
          if (usedRows.has(row.idx)) continue
          const diff = Math.abs(row.boardMin - candidate.etaMin)
          if (diff < bestDiff) {
            bestDiff = diff
            bestIdx = row.idx
          }
        }
        if (bestIdx >= 0) {
          usedRows.add(bestIdx)
          result.set(bestIdx, candidate.predictIndex)
        }
      }
    }
    return result
  }, [filtered, realtimeByStationId, sday])

  const rowRefs = React.useRef<Map<number, HTMLLIElement>>(new Map())

  const scrollToHighlighted = React.useCallback(() => {
    const el = rowRefs.current.get(highlightedIndex)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedIndex])

  // 기준일·노선 필터가 바뀌어 강조 대상이 달라질 때마다 자동으로 그 행이 보이게 스크롤한다.
  React.useEffect(() => {
    scrollToHighlighted()
  }, [scrollToHighlighted])

  return (
    <div className="min-w-0 space-y-5">
      {!hideDateBasisControl && <DateBasisControl value={sday} onChange={onChange} />}

      <section
        className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
        aria-labelledby="integrated-history-title"
      >
        <div className="border-b border-border p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p id="integrated-history-title" className="text-sm font-bold text-primary">통합시간이력</p>
            <div className="flex shrink-0 items-center gap-1.5">
              {nextEntry && (
                <button
                  type="button"
                  onClick={scrollToHighlighted}
                  className="touch-target rounded-full border border-transparent bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90"
                >
                  현재시각
                </button>
              )}
              <GlossarySheet />
            </div>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            이 구간의 모든 노선 운행 이력을 출발시각순으로 모아 탑승·하차 예상시각을 보여줍니다.
          </p>

          <div
            className="mt-3 flex max-w-full items-center gap-1.5 overflow-x-auto overflow-y-hidden pb-1"
            aria-label="노선 필터"
          >
            <button
              type="button"
              onClick={() => setSelectedRouteId(null)}
              aria-pressed={selectedRouteId == null}
              className={`touch-target shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                selectedRouteId == null
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              전체
            </button>
            {routeEntries.map((entry) => {
              const routeId = String(entry.routeId || '')
              return (
                <RouteBadge
                  key={routeId}
                  route={{
                    routeId,
                    routeName: String(entry.routeName || routeId),
                    routeTypeCd: entry.routeTypeCd,
                  }}
                  size="2xs"
                  selected={selectedRouteId === routeId}
                  onClick={(nextRouteId) => {
                    setSelectedRouteId(selectedRouteId === nextRouteId ? null : nextRouteId)
                  }}
                />
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-[64px_minmax(0,0.65fr)_minmax(0,0.9fr)] gap-3 border-b border-border bg-muted px-3 py-3 text-xs font-bold text-muted-foreground sm:grid-cols-[84px_minmax(130px,0.65fr)_minmax(0,0.9fr)] sm:px-5">
          <span className="text-center">승차</span>
          <span>노선 · 탑승 정류장</span>
          <span className="col-start-3 whitespace-nowrap">목적지 하차 예상</span>
        </div>

        {filtered.length > 0 ? (
          <ol aria-label="통합 시간이력 목록">
            {filtered.map((entry, index) => {
              const matchedPredictIndex = realtimeMatchByIndex.get(index)
              return (
                <TimetableRow
                  key={`${entry.routeId || 'route'}-${entry.vehId || 'vehicle'}-${entry.boardTime || index}-${index}`}
                  entry={entry}
                  sday={sday}
                  highlighted={index === highlightedIndex}
                  realtimeItem={
                    matchedPredictIndex
                      ? realtimeByStationId[String(entry.boardStationId || '')]?.[String(entry.routeId || '')]
                      : null
                  }
                  realtimePredictIndex={matchedPredictIndex ?? 1}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(index, el)
                    else rowRefs.current.delete(index)
                  }}
                />
              )
            })}
          </ol>
        ) : (
          <div className="px-4 py-12 text-center sm:px-6">
            <p className="text-base font-bold text-foreground">표시할 시간이력이 없습니다.</p>
            <p className="mt-1 text-sm text-muted-foreground">다른 기준일을 선택해 보세요.</p>
          </div>
        )}

        <div className="border-t border-border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground sm:px-6">
          총 {filtered.length.toLocaleString()}건 · 과거 실제 운행 기록을 기준으로 하며, 교통 상황과 임시편성에 따라 실제 운행은 달라질 수 있습니다.
        </div>
      </section>
    </div>
  )
}
