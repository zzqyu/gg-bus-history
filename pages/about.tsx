import Head from 'next/head'
import Link from 'next/link'
import { SITE_TITLE } from '../utils/site'

const DIFFERENTIATORS = [
  {
    title: '여러 노선을 하나로 통합',
    desc: '구간을 갈 수 있는 노선을 하나씩 따로 찾아볼 필요 없이, 갈 수 있는 모든 방법을 한 결과로 모아서 보여줘요.',
  },
  {
    title: '하차 예상시각까지 제공',
    desc: '탑승 시각만 알려주는 다른 서비스와 달리, 목적지에서 몇 시에 내리는지까지 과거 이력으로 계산해서 보여줘요.',
  },
  {
    title: '실시간 도착정보 결합',
    desc: '과거 이력 예측에 정부 공공 실시간 도착 API를 함께 반영해서, 오늘 그 버스가 평소보다 늦는지도 바로 알 수 있어요.',
  },
]

const STEPS = [
  {
    number: '1',
    title: '출발·도착 입력',
    desc: '장소 이름이나 주소를 검색하거나, 지도를 눌러 출발지·도착지를 직접 지정하세요.',
  },
  {
    number: '2',
    title: '통합된 결과 확인',
    desc: '탈 수 있는 노선들이 한 화면에 모이고, 각 결과마다 예상 탑승·하차 시각과 소요시간을 보여줘요.',
  },
  {
    number: '3',
    title: '통합시간이력에서 더 보기',
    desc: '한 결과가 마음에 안 들면, 같은 구간의 모든 노선 운행 이력을 시간순으로 모은 목록에서 다른 시간대·노선을 골라보세요.',
  },
]

export default function About() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Head>
        <title>{`서비스 소개 - ${SITE_TITLE}`}</title>
      </Head>

      <div className="mx-auto w-full max-w-[720px] px-5 py-10 sm:py-14">
        <Link
          href="/"
          className="touch-target inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          ← 버스탈시간으로 돌아가기
        </Link>

        <header className="mt-6">
          <h1 className="break-keep text-2xl font-bold tracking-tight sm:text-3xl">버스탈시간이 뭔가요?</h1>
          <p className="mt-3 break-keep text-base leading-7 text-muted-foreground">
            경기도 버스 운행 이력을 바탕으로 "A에서 B로 갈 때 어떤 버스를 타야 하는지"에 답하는
            서비스예요. 출발지와 도착지만 입력하면 탈 수 있는 모든 노선을 모아서 보여주고, 정부
            공공 실시간 도착정보까지 함께 확인할 수 있어요.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            지금 경로 찾아보기
          </Link>
        </header>

        <section className="mt-12">
          <h2 className="text-lg font-bold">다른 버스 서비스와 세 가지가 달라요</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {DIFFERENTIATORS.map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="text-sm font-bold text-foreground">{item.title}</p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-bold">이용 방법</h2>
          <div className="mt-4 space-y-4">
            {STEPS.map((step) => (
              <div key={step.number} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step.number}
                </span>
                <div>
                  <p className="text-sm font-bold text-foreground sm:text-base">{step.title}</p>
                  <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-badge-realtime-border bg-badge-realtime-bg p-5 text-badge-realtime-fg">
          <h2 className="text-sm font-bold">데이터는 어떻게 만들어지나요</h2>
          <p className="mt-2 text-sm leading-6">
            이 서비스는 과거 실제 운행 기록으로 오늘 탈 버스를 예측해요. 그래서 조회 날짜는 어제부터
            15일 전까지만 고를 수 있고, 오늘·미래 날짜는 선택할 수 없어요.
          </p>
          <p className="mt-2 text-sm leading-6">
            하차 기록이 없는 구간은 통계로 추정한 값을 보여주고, 임시편성이나 그날의 교통 상황에 따라
            실제 운행은 달라질 수 있어요. 실시간 도착정보가 있는 경우 과거 이력과 함께 표시해서, 오늘
            얼마나 차이 나는지도 확인할 수 있어요.
          </p>
        </section>

        <footer className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link href="/" className="font-semibold text-primary hover:underline">
            버스탈시간으로 돌아가기 →
          </Link>
        </footer>
      </div>
    </div>
  )
}
