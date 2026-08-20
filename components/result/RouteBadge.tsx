import React from 'react'
import { RouteBadgeInfo } from '../../types'
import { getRouteTypeClass, getRouteTypeLabel } from '../../utils/styleUtils'

interface RouteBadgeProps {
  route: RouteBadgeInfo
  selected?: boolean
  onClick?: (routeId: string) => void
  /** 'xs'/'2xs'는 min-h-11 없이 컴팩트하게 그린다(예: 통합 시간이력 노선 필터줄) — 터치 영역은
   * touch-target::after(-10px 확장)로 여전히 44px 이상 확보된다. '2xs'는 'xs'보다 한 단계 더
   * 작다(예: 결과 카드가 아니라 필터 줄처럼 배지가 여러 개 촘촘히 나열될 때). */
  size?: '2xs' | 'xs' | 'sm' | 'md'
  /** true면 시각적으로 흐리게 표시하고 클릭이 안 먹힌다(예: 결과 카드가 목록에 있을 때 —
   * 카드를 선택(focused-card)해야 그 안의 노선 배지를 누를 수 있게 하는 용도). */
  disabled?: boolean
}

/**
 * 클릭 가능한 노선 배지. FINDINGS.md B1(배지 눌러도 무반응)을 여기서 처음부터 고친다.
 * 색 옆에 유형 라벨을 병기해 색맹 사용자도 노선 유형을 구분할 수 있게 한다.
 */
export default function RouteBadge({ route, selected = false, onClick, size = 'md', disabled = false }: RouteBadgeProps) {
  const label = getRouteTypeLabel(route.routeTypeCd)
  const typeClass = getRouteTypeClass(route.routeTypeCd)
  const sizeClass =
    size === '2xs'
      ? 'text-[11px] px-2 py-0.5'
      : size === 'xs'
        ? 'text-xs px-2.5 py-1'
        : size === 'sm'
          ? 'text-xs px-2 py-1'
          : 'text-sm px-2.5 py-1.5'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(ev) => {
        ev.stopPropagation()
        onClick?.(route.routeId)
      }}
      title={label ? `${route.routeName} (${label})` : route.routeName}
      aria-pressed={selected}
      className={`touch-target ${size === '2xs' || size === 'xs' ? '' : 'min-h-11'} inline-flex items-center gap-1 rounded-full border font-bold whitespace-nowrap ${sizeClass} ${
        disabled ? 'cursor-default opacity-60' : ''
      } ${
        selected ? 'border-transparent bg-slate-900 text-white' : 'border-border bg-background'
      }`}
    >
      <span className={selected ? '' : typeClass}>{route.routeName}</span>
      {label && (
        <span className={`text-[11px] font-normal ${selected ? 'text-white/70' : 'text-muted-foreground'}`}>
          {label}
        </span>
      )}
    </button>
  )
}
