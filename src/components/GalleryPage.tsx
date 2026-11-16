import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Clock, ExternalLink, Plus, RefreshCw, X } from 'lucide-react';
import type { GalleryInput, GalleryItem } from '../types/lesson';
import { fetchApprovedGallery, submitGalleryItem, type BackendMode } from '../services/planApi';

interface GalleryPageProps {
  backendMode: BackendMode;
}

const EMPTY_GALLERY_INPUT: GalleryInput = {
  studentId: '',
  studentName: '',
  appUrl: '',
  intro: '',
};

export default function GalleryPage({ backendMode }: GalleryPageProps) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<GalleryInput>(EMPTY_GALLERY_INPUT);
  const [submitting, setSubmitting] = useState(false);
  const [submitNotice, setSubmitNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadGallery = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetchApprovedGallery();
    setApiConnected(res.connected);
    if (!res.connected) {
      setItems([]);
    } else if (res.error) {
      setLoadError(res.error);
      setItems([]);
    } else {
      setItems(res.items);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitNotice(null);

    const studentId = form.studentId.trim();
    const studentName = form.studentName.trim();
    const appUrl = form.appUrl.trim();
    const intro = form.intro.trim();

    if (!studentId || !studentName) {
      setSubmitNotice({ kind: 'err', text: '학번과 이름(또는 가상 별칭)을 모두 입력해 주세요.' });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(appUrl);
    } catch {
      setSubmitNotice({
        kind: 'err',
        text: 'https:// 또는 http://로 시작하는 올바른 웹페이지 URL을 입력해 주세요.',
      });
      return;
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      setSubmitNotice({ kind: 'err', text: 'URL은 https:// 또는 http:// 주소만 등록할 수 있습니다.' });
      return;
    }

    if (!intro) {
      setSubmitNotice({ kind: 'err', text: '작품 소개글을 입력해 주세요.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitGalleryItem({
        studentId,
        studentName,
        appUrl: parsedUrl.toString(),
        intro,
      });

      if (!res.connected || !res.ok) {
        setSubmitNotice({
          kind: 'err',
          text: res.error || '저장소에 연결되지 않아 등록되지 않았습니다.',
        });
        return;
      }

      setForm(EMPTY_GALLERY_INPUT);
      setSubmitNotice({
        kind: 'ok',
        text: '작품 등록이 접수되었습니다. 교사의 인증(승인)이 완료되면 아래 갤러리에 게시됩니다.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="gallery-page" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-4 border-b border-slate-300 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono-tabular text-xs font-semibold text-slate-600">
            <span className="text-blue-700">실천·공유 · 갤러리</span>
            <span aria-hidden="true">·</span>
            <span>교사 인증 후 전체 공개</span>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            작품 감상 갤러리
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            내가 바이브 코딩으로 만든 웹페이지 주소를 등록하면, 교사 확인 및 인증을 거쳐 우리 반 갤러리에 게시됩니다.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          <button
            type="button"
            onClick={loadGallery}
            disabled={loading}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
          >
            <RefreshCw className="h-4 w-4" />
            <span>목록 새로고침</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowForm((prev) => !prev);
              setSubmitNotice(null);
            }}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span>{showForm ? '등록 양식 닫기' : '내 페이지 등록하기'}</span>
          </button>
        </div>
      </div>

      {(backendMode === 'unavailable' || backendMode === 'db_uninitialized' || !apiConnected) && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs leading-relaxed text-amber-900 sm:text-sm">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              {backendMode === 'db_uninitialized' ? (
                <>
                  <strong className="font-semibold">D1 테이블 준비 필요</strong> — Cloudflare D1 Console에서
                  `setup.sql`의 `gallery_items` 테이블을 생성하면 갤러리 등록과 조회가 동작합니다.
                </>
              ) : (
                <>
                  <strong className="font-semibold">저장 준비 중 (/api 미연결)</strong> — 현재 화면에서는
                  Cloudflare Worker와 D1 저장소가 연결되지 않아 작품 등록 및 게시 목록을 불러올 수 없습니다.
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Student Submission Form */}
      {showForm && (
        <div className="mt-6 rounded-2xl border border-slate-300 bg-white p-5 sm:p-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900 sm:text-lg">내 바이브 코딩 페이지 등록 신청</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              실제 개인정보 보호를 위해 안내된 학번·별칭 규칙에 따라 작성해 주세요. 등록 직후에는 공개되지 않으며 교사 인증 후 게시됩니다.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="galleryStudentId" className="block text-xs font-semibold text-slate-700">
                  학번
                </label>
                <input
                  id="galleryStudentId"
                  type="text"
                  maxLength={30}
                  value={form.studentId}
                  onChange={(e) => setForm((prev) => ({ ...prev, studentId: e.target.value }))}
                  placeholder="예: 10105"
                  className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="galleryStudentName" className="block text-xs font-semibold text-slate-700">
                  이름 (또는 가상 별칭)
                </label>
                <input
                  id="galleryStudentName"
                  type="text"
                  maxLength={40}
                  value={form.studentName}
                  onChange={(e) => setForm((prev) => ({ ...prev, studentName: e.target.value }))}
                  placeholder="예: 푸른하늘"
                  className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="galleryAppUrl" className="block text-xs font-semibold text-slate-700">
                웹페이지 URL
              </label>
              <input
                id="galleryAppUrl"
                type="url"
                maxLength={500}
                value={form.appUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, appUrl: e.target.value }))}
                placeholder="https://example.pages.dev"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="galleryIntro" className="block text-xs font-semibold text-slate-700">
                소개글
              </label>
              <textarea
                id="galleryIntro"
                rows={3}
                maxLength={500}
                value={form.intro}
                onChange={(e) => setForm((prev) => ({ ...prev, intro: e.target.value }))}
                placeholder="어떤 실생활 문제를 해결하는 웹페이지인지, 주요 기능을 간단히 소개해 주세요."
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
              <div className="mt-1 text-right text-[11px] text-slate-400 font-mono-tabular">
                {form.intro.length} / 500
              </div>
            </div>

            {submitNotice && (
              <div
                role={submitNotice.kind === 'err' ? 'alert' : 'status'}
                className={`flex items-start gap-2 rounded-lg border px-3.5 py-3 text-xs leading-relaxed sm:text-sm ${
                  submitNotice.kind === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {submitNotice.kind === 'ok' && <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />}
                <span>{submitNotice.text}</span>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setSubmitNotice(null);
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                닫기
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {submitting ? '등록 신청 중...' : '교사 인증 요청하기'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Approved Gallery List */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            교사 인증 완료 작품 ({items.length}건)
          </h2>
        </div>

        {loadError && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="mt-4 rounded-xl border border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            갤러리 목록을 불러오는 중입니다...
          </div>
        ) : items.length === 0 ? (
          <div className="mt-4 rounded-xl border border-slate-300 bg-white p-8 text-center sm:p-12">
            <p className="text-sm font-semibold text-slate-900">아직 교사 인증이 완료된 작품이 없습니다.</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              바이브 코딩으로 제작한 웹페이지를 등록하면, 선생님이 확인 후 인증한 작품부터 이곳에 전시됩니다.
            </p>
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-800 transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>첫 번째 작품 등록하기</span>
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex flex-col justify-between rounded-xl border border-slate-300 bg-white p-5 transition-colors hover:border-slate-300"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-mono-tabular font-semibold text-blue-700">{item.studentId}</span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-semibold text-slate-900 truncate">{item.studentName}</span>
                    </div>
                    <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
                      {new Date(item.updatedAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {item.intro}
                  </p>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3.5">
                  <div className="truncate text-[11px] text-slate-400 font-mono-tabular">{item.appUrl}</div>
                  <a
                    href={item.appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-950 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 hover:border-blue-700 transition-colors"
                  >
                    <span>작품 페이지 열기</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
