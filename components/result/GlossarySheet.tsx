import React from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet'
import { getRouteTypeLabel } from '../../utils/styleUtils'

const ROUTE_TYPE_LEGEND: Array<{ code: string; className: string }> = [
  { code: '11', className: 'text-route-express' },
  { code: '12', className: 'text-route-seat' },
  { code: '13', className: 'text-route-normal' },
  { code: '30', className: 'text-route-village' },
  { code: '15', className: 'text-route-etc' },
]

const BADGE_LEGEND: Array<{ label: string; bg: string; fg: string; border: string; desc: string }> = [
  { label: '이력', bg: 'bg-badge-history-bg', fg: 'text-badge-history-fg', border: 'border-badge-history-border', desc: '과거 실제 운행 기록 기준 시각' },
  { label: '실시간', bg: 'bg-badge-realtime-bg', fg: 'text-badge-realtime-fg', border: 'border-badge-realtime-border', desc: '현재 실시간 도착 예측 기준 시각' },
  { label: '지연', bg: 'bg-badge-delayed-bg', fg: 'text-badge-delayed-fg', border: 'border-badge-delayed-border', desc: '실시간이 이력보다 7분 이상 늦음' },
  { label: '추정', bg: 'bg-badge-inferred-bg', fg: 'text-badge-inferred-fg', border: 'border-badge-inferred-border', desc: '하차 기록이 없어 통계로 추정한 값' },
  { label: '지나감', bg: 'bg-badge-past-bg', fg: 'text-badge-past-fg', border: 'border-badge-past-border', desc: '이미 지난 시각의 이력' },
]

interface GlossarySheetProps {
  trigger?: React.ReactNode
}

/** 카드마다 반복되던 "범례: 이력/실시간" 행을 여기로 옮긴다 (phase-3-preview-mockups.md P3-T2). */
export default function GlossarySheet({ trigger }: GlossarySheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="touch-target inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs font-semibold"
          >
            <span aria-hidden="true">ⓘ</span> 용어 안내
          </button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>용어 안내</SheetTitle>
          <SheetDescription>결과 화면에서 쓰이는 배지와 안내 문구를 설명합니다.</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          <section className="rounded-md border border-badge-realtime-border bg-badge-realtime-bg p-3 text-badge-realtime-fg">
            <p className="text-sm font-bold">이 서비스는 과거 실제 운행 기록으로 오늘 탈 버스를 예측합니다.</p>
            <p className="mt-1 text-sm">그래서 조회 날짜는 어제부터 15일 전까지만 고를 수 있어요. 오늘·미래 날짜는 선택할 수 없습니다.</p>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-bold">시각 배지</h3>
            <ul className="space-y-2">
              {BADGE_LEGEND.map((b) => (
                <li key={b.label} className="flex items-start gap-2">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold border ${b.bg} ${b.fg} ${b.border}`}>
                    {b.label}
                  </span>
                  <span className="text-sm text-muted-foreground">{b.desc}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-bold">노선 유형 색상</h3>
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {ROUTE_TYPE_LEGEND.map((r) => (
                <li key={r.code} className={`text-sm font-bold ${r.className}`}>
                  ● {getRouteTypeLabel(r.code) || '기타'}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2 text-sm text-muted-foreground">
            <p>하차 기록이 없는 경우 통계적으로 산출된 예상값입니다.</p>
            <p>현재·미래 운행 일정, 임시편성은 반영되지 않을 수 있습니다.</p>
            <p>도보 시간은 직선거리 기준 추정치입니다.</p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
