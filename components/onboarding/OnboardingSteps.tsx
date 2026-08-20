import React from 'react'

const STEPS = [
  {
    number: '①',
    title: '출발지와 도착지를 정하세요',
    description: '검색하거나 지도 핀을 찍고, 현재 위치를 출발지로 사용할 수 있어요.',
  },
  {
    number: '②',
    title: '기준 날짜를 고르세요',
    description: '어제부터 15일 전까지, 오늘과 비슷한 운행일을 선택하세요.',
  },
  {
    number: '③',
    title: '검색하면 탈 수 있는 버스가 나와요',
    description: '과거 운행 시각과 현재 실시간 정보를 비교해 여정을 확인하세요.',
  },
]

export default function OnboardingSteps() {
  return (
    <div>
      <h2 className="text-lg font-bold sm:text-xl">이렇게 이용하세요</h2>
      <ol className="mt-4 space-y-3">
        {STEPS.map((step, index) => (
          <li key={step.number} className="relative flex gap-3 rounded-xl border border-border bg-background p-4">
            {index < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute bottom-[-13px] left-[27px] z-10 h-6 border-l-2 border-dashed border-primary/30"
              />
            )}
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {step.number}
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-bold leading-6">{step.title}</h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
