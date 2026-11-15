import { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

export const GALLERY_URL =
  'https://script.google.com/macros/s/AKfycbz5HkdUhDFlclvRptEXpVlT9BxXdQ5oCpb9RHHE4sH3M86jEptQXDzVOb1mh3LCbgjX/exec';

export default function GalleryPage() {
  const [frameKey, setFrameKey] = useState(0);

  return (
    <section id="gallery-page" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-500">
            <span className="font-semibold text-sky-700">실천·공유 · 갤러리</span>
            <span aria-hidden="true">·</span>
            <span>외부 Google Apps Script 웹앱 연결</span>
          </div>
          <h1 className="mt-1.5 text-xl font-bold text-slate-900 sm:text-2xl">
            바이브 코딩 프로젝트 갤러리
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            제작한 실생활 문제 해결 웹앱을 공유하고 사용자 피드백을 나누는 외부 갤러리 페이지입니다.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          <button
            type="button"
            onClick={() => setFrameKey((k) => k + 1)}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
          >
            <RefreshCw className="h-4 w-4" />
            <span>화면 새로고침</span>
          </button>

          <a
            href={GALLERY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0 sm:flex-initial"
          >
            <span>새 탭에서 갤러리 열기</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <iframe
          key={frameKey}
          src={GALLERY_URL}
          title="바이브 코딩 프로젝트 갤러리"
          className="h-[72vh] min-h-[540px] w-full border-0 bg-white"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-xs leading-relaxed text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>
          브라우저나 Google Apps Script 보안 설정(`X-Frame-Options`)에 의해 페이지 내 화면이 표시되지 않는 경우,
          오른쪽 링크로 새 탭에서 바로 여실 수 있습니다.
        </span>
        <a
          href={GALLERY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-sky-700 hover:underline whitespace-nowrap shrink-0 sm:min-h-0"
        >
          <span>갤러리 바로 열기</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </section>
  );
}
