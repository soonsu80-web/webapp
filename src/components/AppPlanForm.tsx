import { useState, type FormEvent } from 'react';
import { ArrowLeft, Check, CheckCircle2, Clock, Copy, RotateCcw, Send } from 'lucide-react';
import type { AppPlanInput, AppPlanSubmission } from '../types/lesson';
import { submitPlanToApi, type BackendMode } from '../services/planApi';
import { buildPromptDraft } from '../utils/promptDraft';

interface AppPlanFormProps {
  form: AppPlanInput;
  onUpdateField: <K extends keyof AppPlanInput>(key: K, value: AppPlanInput[K]) => void;
  onGoToDiscovery: () => void;
  backendMode: BackendMode;
  lastSavedPlan: AppPlanSubmission | null;
  onPlanSaved: (plan: AppPlanSubmission) => void;
  onBackendModeChange: (mode: BackendMode) => void;
  onResetDraft: () => void;
}

function formatAuthorSummary(form: AppPlanInput): string {
  const g = form.grade.trim();
  const c = form.classRoom.trim();
  const n = form.studentName.trim();
  if (!g && !c && !n) return '미입력';
  const gradeText = g ? (g.endsWith('학년') ? g : `${g}학년`) : '';
  const classText = c ? (c.endsWith('반') ? c : `${c}반`) : '';
  return [gradeText, classText, n].filter(Boolean).join(' ');
}

export default function AppPlanForm({
  form,
  onUpdateField,
  onGoToDiscovery,
  backendMode,
  lastSavedPlan,
  onPlanSaved,
  onBackendModeChange,
  onResetDraft,
}: AppPlanFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingDiscovery, setMissingDiscovery] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);

  const promptDraftText = buildPromptDraft(form);

  const discoveryComplete =
    form.grade.trim().length > 0 &&
    form.classRoom.trim().length > 0 &&
    form.studentName.trim().length > 0 &&
    form.problemSummary.trim().length > 0 &&
    form.urgencyReason.trim().length > 0 &&
    form.publicBenefitReason.trim().length > 0 &&
    form.inquiryQuestion.trim().length > 0;

  function handleFieldChange<K extends keyof AppPlanInput>(key: K, value: AppPlanInput[K]) {
    onUpdateField(key, value);
    if (errorMessage) setErrorMessage(null);
    if (missingDiscovery) setMissingDiscovery(false);
    if (successMessage) setSuccessMessage(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setMissingDiscovery(false);
    setSuccessMessage(null);

    if (!form.grade.trim() || !form.classRoom.trim() || !form.studentName.trim()) {
      setMissingDiscovery(true);
      setErrorMessage('‘문제탐색’ 페이지에서 작성자의 학년, 반, 성명을 먼저 입력해 주세요.');
      return;
    }
    if (
      !form.problemSummary.trim() ||
      !form.urgencyReason.trim() ||
      !form.publicBenefitReason.trim() ||
      !form.inquiryQuestion.trim()
    ) {
      setMissingDiscovery(true);
      setErrorMessage('‘문제탐색’ 페이지의 실생활 문제, 시급성·공공의 이익, 탐구 질문을 모두 작성해 주세요.');
      return;
    }
    if (!form.screenComposition.trim()) {
      setErrorMessage('웹앱의 화면 구성과 필요 요소 분석을 작성해 주세요.');
      return;
    }
    if (
      !form.featuresToImplement.trim() ||
      !form.dataToStore.trim() ||
      !form.constraints.trim() ||
      !form.programmingPrinciples.trim()
    ) {
      setErrorMessage('앱 기획서 4가지 항목(기능, 저장 데이터, 제약사항, 프로그래밍 원리)을 모두 작성해 주세요.');
      return;
    }
    if (!form.finalPrompt.trim()) {
      setErrorMessage('프롬프트 완성본을 작성해 주세요.');
      return;
    }
    if (!form.safetyChecked) {
      setErrorMessage('디지털 안전 약속 확인 체크박스를 선택해 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitPlanToApi({
        ...form,
        promptDraft: promptDraftText,
      });
      if (result.connected && result.ok && result.plan) {
        onBackendModeChange('ready');
        onPlanSaved(result.plan);
        setSuccessMessage(
          '앱 기획서가 D1 저장소에 안전하게 제출되었습니다. 비공개 응답 보호 원칙에 따라 제출 내역은 교사만 열람할 수 있습니다.',
        );
      } else if (!result.connected) {
        onBackendModeChange('unavailable');
        setErrorMessage(
          result.error ||
            '저장 준비 중: 현재 환경에는 Cloudflare Worker(/api/plans)가 연결되지 않아 저장되지 않았습니다.',
        );
      } else {
        setErrorMessage(result.error || '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleClear() {
    setErrorMessage(null);
    setMissingDiscovery(false);
    setSuccessMessage(null);
    onResetDraft();
  }

  return (
    <section id="app-plan-form" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono-tabular text-xs font-semibold text-slate-600">
            <span className="text-blue-700">2차시 · 앱 기획서</span>
            <span aria-hidden="true">·</span>
            <span>
              {backendMode === 'checking'
                ? '저장소 연결 확인 중'
                : backendMode === 'ready'
                  ? 'D1 저장소 연결됨 (/api/plans)'
                  : backendMode === 'db_uninitialized'
                    ? 'D1 테이블 미생성 (setup.sql 실행 필요)'
                    : '저장 준비 중 (/api 미연결)'}
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            웹앱 화면 구성 및 앱 기획서 완성
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            문제탐색에서 정리한 내용을 바탕으로 화면 구성, 구현 기능, 데이터, 제약사항, 프로그래밍 원리를 작성하세요.
          </p>
        </div>

        {(lastSavedPlan || form.problemSummary || form.screenComposition) && (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span>입력 초기화</span>
          </button>
        )}
      </div>

      {backendMode !== 'ready' && backendMode !== 'checking' && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs leading-relaxed text-amber-900 sm:text-sm">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              {backendMode === 'db_uninitialized' ? (
                <>
                  <strong className="font-semibold">D1 데이터베이스 테이블 준비 필요</strong> — Worker(`/api`)는
                  동작 중이지만 `setup.sql` 테이블이 아직 생성되지 않아 저장할 수 없습니다.
                </>
              ) : (
                <>
                  <strong className="font-semibold">저장 준비 중 (/api 미연결)</strong> — 현재 Preview 환경에는
                  Cloudflare Worker와 D1 저장소가 연결되어 있지 않습니다. Cloudflare 발행 및 D1 연결 후 실제 저장됩니다.
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 문제탐색 연결 요약 */}
      <div className="mt-6 rounded-xl border border-slate-300 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">
              연결된 문제탐색 내용 · {discoveryComplete ? '작성 완료' : '미완성 항목 있음'}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              작성자: {formatAuthorSummary(form)}
              {form.problemSummary.trim() && (
                <span className="font-normal text-slate-600"> · {form.problemSummary.trim()}</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onGoToDiscovery}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{discoveryComplete ? '문제탐색 수정' : '문제탐색 작성하러 가기'}</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6 sm:space-y-8">
        {/* 화면 구성 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">01. [활동] (과업)탐구하기</div>
            <h2 className="mt-0.5 text-base font-bold text-slate-900">
              웹앱의 화면 구성과 필요 요소 분석
            </h2>
          </div>

          <div>
            <label htmlFor="screenComposition" className="block text-sm font-medium text-slate-800">
              웹앱 화면 구성 및 구축 절차
            </label>
            <textarea
              id="screenComposition"
              rows={3}
              maxLength={1500}
              value={form.screenComposition}
              onChange={(e) => handleFieldChange('screenComposition', e.target.value)}
              placeholder="일상생활에서 접하는 앱을 참고하여, 내 웹앱에 어떤 화면(예: 상단 제목, 입력창, 버튼, 결과 목록 등)과 구축 절차가 필요한지 적어 주세요."
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
            />
          </div>
        </div>

        {/* 정리: 앱 기획서 4항목 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">02. [정리] 앱 기획서 완성</div>
            <h2 className="mt-0.5 text-base font-bold text-slate-900">
              구현 기능 · 저장 데이터 · 제약사항 · 프로그래밍 원리
            </h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="featuresToImplement" className="block text-sm font-medium text-slate-800">
                ① 구현할 기능
              </label>
              <textarea
                id="featuresToImplement"
                rows={4}
                maxLength={1500}
                value={form.featuresToImplement}
                onChange={(e) => handleFieldChange('featuresToImplement', e.target.value)}
                placeholder="사용자가 버튼을 누르거나 입력했을 때 웹앱이 수행할 핵심 기능을 적어 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="dataToStore" className="block text-sm font-medium text-slate-800">
                ② 저장할 데이터 (개인정보 제외)
              </label>
              <textarea
                id="dataToStore"
                rows={4}
                maxLength={1500}
                value={form.dataToStore}
                onChange={(e) => handleFieldChange('dataToStore', e.target.value)}
                placeholder="웹앱에서 입력받아 기록하거나 유지해야 할 데이터 항목을 적어 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="constraints" className="block text-sm font-medium text-slate-800">
                ③ 제약사항
              </label>
              <textarea
                id="constraints"
                rows={4}
                maxLength={1500}
                value={form.constraints}
                onChange={(e) => handleFieldChange('constraints', e.target.value)}
                placeholder="개인정보 보호, 공공의 이익 침해 방지, 입력값 조건, 화면 크기 제한 등 지켜야 할 제약을 적어 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="programmingPrinciples" className="block text-sm font-medium text-slate-800">
                ④ 적용할 프로그래밍 원리
              </label>
              <textarea
                id="programmingPrinciples"
                rows={4}
                maxLength={1500}
                value={form.programmingPrinciples}
                onChange={(e) => handleFieldChange('programmingPrinciples', e.target.value)}
                placeholder="문제 분해·모델링, 제어 구조(조건문·반복문 등), 데이터 구조 중 어떤 원리가 어디에 쓰이는지 설명해 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
            </div>
          </div>
        </div>

        {/* 사용할 프롬프트 초안 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="text-xs font-medium text-slate-500">03. 프롬프트 구조화</div>
              <h2 className="mt-0.5 text-base font-bold text-slate-900">사용할 프롬프트 초안</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                문제탐색과 앱 기획서에서 입력한 모든 내용을 ‘제목: 입력한 내용’ 형태로 자동 정리한 초안입니다.
              </p>
            </div>

            {promptDraftText && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(promptDraftText);
                    setCopiedDraft(true);
                    window.setTimeout(() => setCopiedDraft(false), 1800);
                  } catch {
                    // Ignore clipboard permission errors
                  }
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedDraft ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedDraft ? '초안 복사됨' : '초안 복사'}</span>
              </button>
            )}
          </div>

          {promptDraftText ? (
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-4 font-sans text-sm leading-relaxed text-slate-800">
              {promptDraftText}
            </pre>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs leading-relaxed text-slate-500 sm:text-sm">
              문제탐색과 앱 기획서의 각 항목을 입력하면 이곳에 번호가 매겨진 프롬프트 초안이 자동으로 나타납니다.
            </div>
          )}
        </div>

        {/* 프롬프트 완성본 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-3">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">04. 최종 프롬프트 작성</div>
            <label htmlFor="finalPrompt" className="mt-0.5 block text-base font-bold text-slate-900">
              프롬프트 완성본
            </label>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
              프롬프트 완성본: 프롬프트 초안을 수정하여 다시 완성하세요.
            </p>
          </div>

          <textarea
            id="finalPrompt"
            rows={7}
            maxLength={6000}
            value={form.finalPrompt}
            onChange={(e) => handleFieldChange('finalPrompt', e.target.value)}
            placeholder="위의 프롬프트 초안을 참고해 수정·보완한 최종 프롬프트를 입력해 주세요."
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
          />
          <div className="text-right text-[11px] text-slate-400 font-mono-tabular">
            {form.finalPrompt.length} / 6000
          </div>
        </div>

        {/* 디지털 안전 약속 확인 및 응답 제출 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6">
          <label className="flex min-h-[44px] items-start gap-3 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={form.safetyChecked}
              onChange={(e) => handleFieldChange('safetyChecked', e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span className="text-sm leading-relaxed text-slate-700">
              <strong className="font-semibold text-slate-900">디지털 안전 약속 확인</strong> — 공공의 이익에 반하지 않는 주제로 작성하였습니다.
            </span>
          </label>

          {errorMessage && (
            <div
              role="alert"
              className="mt-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{errorMessage}</span>
              {missingDiscovery && (
                <button
                  type="button"
                  onClick={onGoToDiscovery}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  문제탐색으로 이동
                </button>
              )}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-900"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500 font-mono-tabular">
              {lastSavedPlan
                ? `최근 저장 완료: ${new Date(lastSavedPlan.updatedAt).toLocaleString('ko-KR')}`
                : backendMode === 'ready'
                  ? '제출 시 Cloudflare D1에 저장되며 교사만 확인할 수 있습니다.'
                  : '저장소가 연결되면 D1에 실제 저장됩니다.'}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:w-auto sm:min-h-[46px]"
            >
              <Send className="h-4 w-4" />
              <span>{submitting ? '저장 요청 중...' : '앱 기획서 제출하기'}</span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
