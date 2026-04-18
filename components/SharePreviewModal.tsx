import React from 'react'

interface SharePreviewModalProps {
  open: boolean
  title?: string
  text: string
  baseTime: string
  onBaseTimeChange: (v: string) => void
  onClose: () => void
  onShare: () => Promise<void>
  onKakaoShare: () => Promise<void>
  onCopy: () => Promise<void>
  onCopyLink: () => Promise<void>
  loading?: boolean
}

export default function SharePreviewModal({ open, title, text, baseTime, onBaseTimeChange, onClose, onShare, onKakaoShare, onCopy, onCopyLink, loading = false }: SharePreviewModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-[min(720px,90%)] max-h-[80vh] overflow-auto rounded bg-white shadow-lg">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 pt-4 pb-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold">{title || '공유 미리보기'}</h3>
            <button
              className="text-sm text-slate-600 flex items-center justify-center"
              type="button"
              onClick={onClose}
              aria-label="닫기"
              title="닫기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l8 8M6 14L14 6" />
              </svg>
            </button>
          </div>
          {!loading && (
            <div className="rounded border border-slate-200 p-3">
              <div className="mb-2 text-sm font-semibold">기준 시간</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="time"
                  value={baseTime}
                  onChange={(e) => onBaseTimeChange(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                  onClick={() => {
                    const now = new Date()
                    const hh = String(now.getHours()).padStart(2, '0')
                    const mm = String(now.getMinutes()).padStart(2, '0')
                    onBaseTimeChange(`${hh}:${mm}`)
                  }}
                >
                  현재시각
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                  onClick={() => {
                    const d = new Date(Date.now() + 30 * 60 * 1000)
                    const hh = String(d.getHours()).padStart(2, '0')
                    const mm = String(d.getMinutes()).padStart(2, '0')
                    onBaseTimeChange(`${hh}:${mm}`)
                  }}
                >
                  +30분
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                  onClick={() => {
                    const d = new Date(Date.now() + 60 * 60 * 1000)
                    const hh = String(d.getHours()).padStart(2, '0')
                    const mm = String(d.getMinutes()).padStart(2, '0')
                    onBaseTimeChange(`${hh}:${mm}`)
                  }}
                >
                  +60분
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3">
        {loading ? (
          <div className="p-6 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full border-4 border-t-transparent border-slate-700 animate-spin" />
            <div>
              <div className="mb-1 text-base font-medium">공유 내용을 준비 중입니다...</div>
              <div className="text-sm text-slate-600">잠시만 기다려주세요.</div>
            </div>
          </div>
        ) : (
          <>
            <pre className="whitespace-pre-wrap break-words rounded border border-slate-200 p-3 text-sm">{text}</pre>
          </>
        )}
        </div>
        {!loading && (
          <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white px-4 py-3">
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={loading}
                className="rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-60"
                onClick={onCopyLink}
              >
                링크만 복사
              </button>
              <button
                type="button"
                disabled={loading}
                className="rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-60"
                onClick={onCopy}
              >
                클립보드에 복사
              </button>
              <button
                type="button"
                disabled={loading}
                className="rounded border border-yellow-300 bg-yellow-300 px-3 py-1 text-sm font-semibold text-slate-900 hover:bg-yellow-200 disabled:opacity-60"
                onClick={onKakaoShare}
              >
                카카오톡 공유
              </button>
              <button
                type="button"
                disabled={loading}
                className="rounded bg-slate-900 px-3 py-1 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                onClick={onShare}
              >
                공유
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
