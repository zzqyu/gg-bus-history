import React from 'react'

interface SharePreviewModalProps {
  open: boolean
  title?: string
  text: string
  onClose: () => void
  onShare: () => Promise<void>
  onCopy: () => Promise<void>
  loading?: boolean
}

export default function SharePreviewModal({ open, title, text, onClose, onShare, onCopy, loading = false }: SharePreviewModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-[min(720px,90%)] max-h-[80vh] overflow-auto rounded bg-white p-4 shadow-lg">
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
            <div className="mt-3 flex gap-2 justify-end">
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
                className="rounded bg-slate-900 px-3 py-1 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                onClick={onShare}
              >
                공유하기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
