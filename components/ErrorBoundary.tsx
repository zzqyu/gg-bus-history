import React from 'react'

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * 렌더 중 예외가 나면 백지 화면 대신 복구 UI를 보여준다(FINDINGS.md B8).
 * React Error Boundary는 클래스 컴포넌트로만 구현할 수 있다(getDerivedStateFromError/componentDidCatch에
 * 대응하는 훅이 없음).
 */
export default class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-lg font-bold text-slate-900">문제가 발생했어요</p>
          <p className="max-w-sm text-sm text-slate-600">
            화면을 표시하는 중 오류가 발생했습니다. 새로고침해서 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="touch-target rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
