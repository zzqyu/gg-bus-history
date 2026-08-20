import React from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'

function StepHeading({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {number}
      </span>
      <div>
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

interface SearchScreenProps {
  startValue: string
  endValue: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  startRadius: number
  endRadius: number
  onStartRadiusChange: (value: number) => void
  onEndRadiusChange: (value: number) => void
  /** 지도에서 출발/도착 핀이 둘 다 지정됐는지 — 검색 가능 여부 판단에 쓴다. */
  pinsPlaced: boolean
  onOpenMapPicker?: () => void
  onSubmit: () => void
  canSubmit?: boolean
}

/**
 * 첫화면(검색) 예시 (Phase 4 프로덕션 버전). `components/preview/claude2/SearchScreen.tsx`(P3-T11)를
 * 승격하며 정적 `readOnly` 입력을 controlled 입력으로 바꿨다. 장소 검색 자동완성·지도 핀 드래그 같은
 * 실제 동작은 `pages/index.tsx`의 기존 로직을 이 컴포넌트에 연결해서 구현한다(P4-T1).
 *
 * 검색 전에 날짜를 묻지 않는다(네이버지도/카카오맵/GBIS 패턴, P3-T15) — 기준일은 검색 후
 * 결과/시간이력 화면의 `DaySwitcher`에서 고른다(기본값: `getDefaultSday()` = 지난주 같은 요일).
 */
export default function SearchScreen({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  startRadius,
  endRadius,
  onStartRadiusChange,
  onEndRadiusChange,
  pinsPlaced,
  onOpenMapPicker,
  onSubmit,
  canSubmit = true,
}: SearchScreenProps) {
  const [radiusOpen, setRadiusOpen] = React.useState(false)

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-badge-realtime-border bg-badge-realtime-bg p-5 text-badge-realtime-fg sm:p-6">
        <p className="text-sm font-bold">이 서비스는 다른 버스 서비스와 두 가지가 달라요</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-background/60 p-3">
            <p className="text-sm font-bold">여러 노선을 하나로 통합</p>
            <p className="mt-1 text-xs leading-5">
              구간을 갈 수 있는 노선을 하나씩 따로 찾아볼 필요 없이, 갈 수 있는 모든 방법을 한 결과로
              모아서 보여줘요.
            </p>
          </div>
          <div className="rounded-xl bg-background/60 p-3">
            <p className="text-sm font-bold">하차 예상시각까지 제공</p>
            <p className="mt-1 text-xs leading-5">
              탑승 시각만 알려주는 다른 서비스와 달리, 목적지에서 몇 시에 내리는지까지 과거 이력으로
              계산해서 보여줘요.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="search-panel-title" className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">검색 조건</p>
            <h1 id="search-panel-title" className="mt-1 text-xl font-bold tracking-tight">출발지와 도착지를 정해 버스를 찾아보세요</h1>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">1 → 2 → 3 순서</span>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-background p-4">
            <StepHeading number="1" title="출발·도착 입력" description="장소 이름이나 주소를 입력하세요." />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-foreground">출발지</span>
                <div className="flex min-h-12 items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
                  <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-origin text-xs font-bold text-white">A</span>
                  <input
                    aria-label="출발지"
                    value={startValue}
                    onChange={(ev) => onStartChange(ev.target.value)}
                    placeholder="출발지를 입력하세요"
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                  />
                  <span aria-hidden="true" className="text-muted-foreground">⌕</span>
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-foreground">도착지</span>
                <div className="flex min-h-12 items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
                  <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destination text-xs font-bold text-white">B</span>
                  <input
                    aria-label="도착지"
                    value={endValue}
                    onChange={(ev) => onEndChange(ev.target.value)}
                    placeholder="도착지를 입력하세요"
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                  />
                  <span aria-hidden="true" className="text-muted-foreground">⌕</span>
                </div>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <StepHeading number="2" title="지도 핀 지정" description="정류장까지의 이동 범위를 지도에서 확인하세요." />
            <button
              type="button"
              onClick={onOpenMapPicker}
              className="touch-target mt-4 flex min-h-12 w-full items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-4 text-left text-sm font-semibold text-foreground hover:bg-primary/10"
            >
              <span className="flex items-center gap-2"><span aria-hidden="true" className="text-lg text-primary">⌖</span>지도에서 출발·도착 핀 지정</span>
              <span className="text-xs font-medium text-muted-foreground">{pinsPlaced ? '핀 2개 지정됨' : '핀 미지정'}</span>
            </button>
          </div>

          <Collapsible open={radiusOpen} onOpenChange={setRadiusOpen} className="rounded-xl border border-border bg-background p-4">
            <CollapsibleTrigger asChild>
              <button type="button" className="touch-target flex min-h-11 w-full items-center justify-between text-left">
                <StepHeading number="3" title="반경 설정" description="정류장을 찾을 범위를 조절하세요." />
                <span aria-hidden="true" className={`ml-3 shrink-0 text-lg text-muted-foreground transition-transform ${radiusOpen ? 'rotate-180' : ''}`}>⌄</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
                <label className="block">
                  <span className="flex items-center justify-between text-sm font-semibold"><span>출발지 주변</span><span className="text-primary">{startRadius}m</span></span>
                  <input
                    aria-label="출발지 반경"
                    type="range"
                    min={100}
                    max={1500}
                    value={startRadius}
                    onChange={(ev) => onStartRadiusChange(Number(ev.target.value))}
                    className="mt-3 w-full accent-primary"
                  />
                </label>
                <label className="block">
                  <span className="flex items-center justify-between text-sm font-semibold"><span>도착지 주변</span><span className="text-primary">{endRadius}m</span></span>
                  <input
                    aria-label="도착지 반경"
                    type="range"
                    min={100}
                    max={1500}
                    value={endRadius}
                    onChange={(ev) => onEndRadiusChange(Number(ev.target.value))}
                    className="mt-3 w-full accent-primary"
                  />
                </label>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-5 text-muted-foreground">
                날짜는 미리 안 골라도 돼요 — 검색하면 <strong className="text-foreground">지난주 같은 요일</strong> 기록을
                먼저 보여드리고, 결과 화면에서 언제든 바꿀 수 있어요.
              </p>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="touch-target min-h-12 shrink-0 rounded-lg bg-primary px-6 text-base font-bold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                버스 찾기
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
