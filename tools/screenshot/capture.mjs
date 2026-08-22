#!/usr/bin/env node
// UI 변경을 실제 브라우저로 캡처해서 눈으로 확인하기 위한 범용 스크린샷 스크립트.
// Claude Code든 Codex든, 어떤 에이전트든 그냥 `node`로 실행하면 된다(특정 도구
// 전용 스킬이 아님). 사용 전 1회 설치 필요 — README.md 참고.
//
// 사용법:
//   node tools/screenshot/capture.mjs --url "http://localhost:3000/?view=results" --out /tmp/shot.png
//
// 옵션:
//   --url <url>            (필수) 접속할 전체 URL
//   --out <path>            (필수) 저장할 png 경로
//   --width <n>              뷰포트 너비 (기본 390, 모바일 폭)
//   --height <n>             뷰포트 높이 (기본 900)
//   --wait <ms>              고정 대기시간(ms, 기본 1500) — networkidle 이후 추가로 기다림
//   --wait-selector <sel>    이 셀렉터가 나타날 때까지 대기(있으면 --wait보다 우선 확인)
//   --no-full-page           페이지 전체가 아니라 현재 뷰포트만 캡처
//   --timeout <ms>           네비게이션 타임아웃(기본 30000)

import { chromium } from 'playwright'

function parseArgs(argv) {
  const args = { width: 390, height: 900, wait: 1500, timeout: 30000, fullPage: true }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--url') args.url = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--width') args.width = Number(argv[++i])
    else if (a === '--height') args.height = Number(argv[++i])
    else if (a === '--wait') args.wait = Number(argv[++i])
    else if (a === '--wait-selector') args.waitSelector = argv[++i]
    else if (a === '--timeout') args.timeout = Number(argv[++i])
    else if (a === '--no-full-page') args.fullPage = false
    else {
      console.error(`알 수 없는 인자: ${a}`)
      process.exit(1)
    }
  }
  if (!args.url || !args.out) {
    console.error('사용법: node capture.mjs --url <url> --out <path.png> [--width n] [--height n] [--wait ms] [--wait-selector sel] [--no-full-page]')
    process.exit(1)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: args.width, height: args.height } })
    await page.goto(args.url, { waitUntil: 'networkidle', timeout: args.timeout })

    if (args.waitSelector) {
      await page.waitForSelector(args.waitSelector, { timeout: args.timeout })
    } else {
      await page.waitForTimeout(args.wait)
    }

    await page.screenshot({ path: args.out, fullPage: args.fullPage })
    console.log(`저장됨: ${args.out}`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
