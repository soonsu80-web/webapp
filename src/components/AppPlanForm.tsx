import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Clock, RotateCcw, Send } from 'lucide-react';
import type { AppPlanInput, AppPlanSubmission, DiscoverySource } from '../types/lesson';
import { submitPlanToApi } from '../services/planApi';

const DISCOVERY_SOURCES: DiscoverySource[] = [
  '기사',
  '주변 지역사회 주민 인터뷰',
  '가족과의 대화',
  '친구와의 브레인스토밍',
  '수업 중 학교문제 토론',
  '기타 일상 관찰',
];

const EMPTY_FORM: AppPlanInput = {
  grade: '',
  classRoom: '',
  studentName: '',
  discoverySource: '수업 중 학교문제 토론',
  problemSummary: '',
  urgencyReason: '',
  publicBenefitReason: '',
  inquiryQuestion: '',
  screenComposition: '',
  featuresToImplement: '',
  dataToStore: '',
  constraints: '',
  programmingPrinciples: '',
  safetyChecked: false,
};

interface AppPlanFormProps {
  storageConnected: boolean | null;
  currentDraft: AppPlanSubmission | null;
  onPlanRecorded: (plan: AppPlanSubmission, connected: boolean) => void;
  onResetDraft: () => void;
}

export default function AppPlanForm({
  storageConnected,
  currentDraft,
  onPlanRecorded,
  onResetDraft,
}: AppPlanFormProps) {
  const [form, setForm] = useState<AppPlanInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<{
    kind: 'synced' | 'pending';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (currentDraft) {
      setForm({
        grade: currentDraft.grade,
        classRoom: currentDraft.classRoom,
        studentName: currentDraft.studentName,
        discoverySource: currentDraft.discoverySource,
        problemSummary: currentDraft.problemSummary,
        urgencyReason: currentDraft.urgencyReason,
        publicBenefitReason: currentDraft.publicBenefitReason,
        inquiryQuestion: currentDraft.inquiryQuestion,
        screenComposition: currentDraft.screenComposition,
        featuresToImplement: currentDraft.featuresToImplement,
        dataToStore: currentDraft.dataToStore,
        constraints: currentDraft.constraints,
        programmingPrinciples: currentDraft.programmingPrinciples,
        safetyChecked: currentDraft.safetyChecked,
      });
    }
  }, [currentDraft]);

  function updateField<K extends keyof AppPlanInput>(key: K, value: AppPlanInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errorMessage) setErrorMessage(null);
    if (submitNotice) setSubmitNotice(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitNotice(null);

    if (!form.grade.trim() || !form.classRoom.trim() || !form.studentName.trim()) {
      setErrorMessage('작성자의 학년, 반, 성명을 모두 입력해 주세요.');
      return;
    }
    if (!form.problemSummary.trim() || !form.urgencyReason.trim() || !form.publicBenefitReason.trim()) {
      setErrorMessage('1단계(문제 탐색)의 실생활 문제와 시급성·공공의 이익 이유를 모두 작성해 주세요.');
      return;
    }
    if (!form.inquiryQuestion.trim() || !form.screenComposition.trim()) {
      setErrorMessage('2단계(탐구하기)의 탐구 질문과 웹앱 화면 구성을 작성해 주세요.');
      return;
    }
    if (
      !form.featuresToImplement.trim() ||
      !form.dataToStore.trim() ||
      !form.constraints.trim() ||
      !form.programmingPrinciples.trim()
    ) {
      setErrorMessage('3단계(앱 기획서)의 4가지 항목을 모두 작성해 주세요.');
      return;
    }
    if (!form.safetyChecked) {
      setErrorMessage('개인정보 입력 금지 등 디지털 안전 약속 확인 체크박스를 선택해 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const existingSyncedId = currentDraft?.storageState === 'synced' ? currentDraft.id : null;
      const result = await submitPlanToApi(form, existingSyncedId ?? currentDraft?.id ?? null);
      onPlanRecorded(result.plan, result.connected);

      if (result.connected) {
        setSubmitNotice({
          kind: 'synced',
          text: '앱 기획서가 저장소에 제출되었습니다. 교사 확인 화면에서 바로 조회됩니다.',
        });
      } else {
        setSubmitNotice({
          kind: 'pending',
          text: '저장 준비 중: 아직 서버 데이터 저장소(/api/plans)가 연결되지 않아 데이터베이스에는 저장되지 않았습니다. 입력 내용 확인을 위해 현재 브라우저 세션에만 임시 반영되었으며, 3차시에 D1 연결 후 실제 저장됩니다.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleClear() {
    setForm(EMPTY_FORM);
    setErrorMessage(null);
    setSubmitNotice(null);
    onResetDraft();
  }

  return (
    <section id="app-plan-form" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-500">
            <span className="font-semibold text-sky-700">1차시 개인 학습지 · 앱 기획서</span>
            <span aria-hidden="true">·</span>
            <span>
              {storageConnected === null
                ? '저장소 연결 확인 중'
                : storageConnected
                  ? '저장소 연결됨 (/api/plans)'
                  : '저장 준비 중 (/api/plans 미연결 · 3차시 D1 연결 예정)'}
            </span>
          </div>
          <h2 className="mt-1.5 text-xl font-bold text-slate-900">
            실생활 문제 해결 웹앱 기획서 작성
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            설계안의 1차시 흐름([들어가기] → [활동] → [정리])에 따라 순서대로 입력하세요.
          </p>
        </div>

        {currentDraft && (
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

      {storageConnected === false && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs leading-relaxed text-amber-900 sm:text-sm">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <strong className="font-semibold">저장 준비 중 (데이터 저장소 미연결)</strong> — 현재는 화면과 입력 동작을
              확인하는 단계이며, Cloudflare Workers + D1(`/api/plans`) 연결은 3차시에 진행됩니다. 제출 버튼을 누르면
              서버 저장 대신 현재 브라우저 세션의 ‘교사 확인’ 미리보기로만 반영됩니다.
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6 sm:space-y-8">
        {/* 작성자 정보 (학년 · 반 · 성명) */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-900">작성자 정보 (개인)</span>
            <span className="text-xs text-slate-500">연락처·주소 등 추가 개인정보 입력 금지</span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="authorGrade" className="block text-xs font-medium text-slate-700">
                학년
              </label>
              <input
                id="authorGrade"
                type="text"
                inputMode="numeric"
                maxLength={20}
                value={form.grade}
                onChange={(e) => updateField('grade', e.target.value)}
                placeholder="예: 1"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="authorClass" className="block text-xs font-medium text-slate-700">
                반
              </label>
              <input
                id="authorClass"
                type="text"
                inputMode="numeric"
                maxLength={20}
                value={form.classRoom}
                onChange={(e) => updateField('classRoom', e.target.value)}
                placeholder="예: 3"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="authorName" className="block text-xs font-medium text-slate-700">
                성명
              </label>
              <input
                id="authorName"
                type="text"
                maxLength={40}
                value={form.studentName}
                onChange={(e) => updateField('studentName', e.target.value)}
                placeholder="예: 홍길동"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
              />
            </div>
          </div>
        </div>

        {/* 1단계: 들어가기 / 관찰하기 */}
        <div id="problem-discovery" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">01. [들어가기] (현상)관찰하기</div>
            <h3 className="mt-0.5 text-base font-bold text-slate-900">
              일상 속 문제 상황 탐색 및 해결할 문제 선정
            </h3>
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-800">문제를 발견한 탐색 방법</span>
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {DISCOVERY_SOURCES.map((source) => {
                const selected = form.discoverySource === source;
                return (
                  <button
                    key={source}
                    type="button"
                    onClick={() => updateField('discoverySource', source)}
                    className={`min-h-[44px] rounded-lg border px-3.5 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer sm:text-xs ${
                      selected
                        ? 'border-sky-700 bg-sky-50 text-sky-900'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {source}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="problemSummary" className="block text-sm font-medium text-slate-800">
              선정한 실생활 문제
            </label>
            <textarea
              id="problemSummary"
              rows={3}
              maxLength={1500}
              value={form.problemSummary}
              onChange={(e) => updateField('problemSummary', e.target.value)}
              placeholder="기사, 대화, 학교생활 관찰 등에서 발견한 문제 상황을 구체적으로 적어 주세요."
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="urgencyReason" className="block text-sm font-medium text-slate-800">
                선정 기준 ① 시급성
              </label>
              <textarea
                id="urgencyReason"
                rows={3}
                maxLength={1000}
                value={form.urgencyReason}
                onChange={(e) => updateField('urgencyReason', e.target.value)}
                placeholder="이 문제가 지금 당장 해결되어야 하는 이유를 적어 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="publicBenefitReason" className="block text-sm font-medium text-slate-800">
                선정 기준 ② 공공의 이익
              </label>
              <textarea
                id="publicBenefitReason"
                rows={3}
                maxLength={1000}
                value={form.publicBenefitReason}
                onChange={(e) => updateField('publicBenefitReason', e.target.value)}
                placeholder="이 웹앱이 나뿐만 아니라 주변 친구·가족·지역사회에 어떤 도움이 되는지 적어 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
              />
            </div>
          </div>
        </div>

        {/* 2단계: 활동 / 질문하기 & 탐구하기 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">02. [활동] (문제)질문하기 · (과업)탐구하기</div>
            <h3 className="mt-0.5 text-base font-bold text-slate-900">
              탐구 질문 설정 및 웹앱 화면 구성 파악
            </h3>
          </div>

          <div>
            <label htmlFor="inquiryQuestion" className="block text-sm font-medium text-slate-800">
              나의 탐구 질문 (‘어떤 전략과 과정을 거칠까?’ 중심)
            </label>
            <textarea
              id="inquiryQuestion"
              rows={2}
              maxLength={1000}
              value={form.inquiryQuestion}
              onChange={(e) => updateField('inquiryQuestion', e.target.value)}
              placeholder="발견한 실생활 문제를 어떤 절차와 원리로 해결할 수 있을지 궁금한 점을 질문으로 정리해 주세요."
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="screenComposition" className="block text-sm font-medium text-slate-800">
              웹앱의 화면 구성과 필요 요소 분석
            </label>
            <textarea
              id="screenComposition"
              rows={3}
              maxLength={1500}
              value={form.screenComposition}
              onChange={(e) => updateField('screenComposition', e.target.value)}
              placeholder="일상생활에서 접하는 앱을 참고하여, 내 웹앱에 어떤 화면(예: 상단 제목, 입력창, 버튼, 결과 목록 등)이 필요한지 구성해 주세요."
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
            />
          </div>
        </div>

        {/* 3단계: 정리 / 앱 기획서 작성 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">03. [정리] 앱 기획서 완성</div>
            <h3 className="mt-0.5 text-base font-bold text-slate-900">
              구현 기능 · 저장 데이터 · 제약사항 · 프로그래밍 원리
            </h3>
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
                onChange={(e) => updateField('featuresToImplement', e.target.value)}
                placeholder="사용자가 버튼을 누르거나 입력했을 때 웹앱이 수행할 핵심 기능을 적어 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
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
                onChange={(e) => updateField('dataToStore', e.target.value)}
                placeholder="웹앱에서 입력받아 기록하거나 유지해야 할 데이터 항목을 적어 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
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
                onChange={(e) => updateField('constraints', e.target.value)}
                placeholder="개인정보 보호, 공공의 이익 침해 방지, 입력값 조건, 화면 크기 제한 등 지켜야 할 제약을 적어 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
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
                onChange={(e) => updateField('programmingPrinciples', e.target.value)}
                placeholder="문제 분해·모델링, 제어 구조(조건문·반복문 등), 데이터 구조 중 어떤 원리가 어디에 쓰이는지 설명해 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
              />
            </div>
          </div>
        </div>

        {/* 디지털 안전 약속 확인 및 응답 제출 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <label className="flex min-h-[44px] items-start gap-3 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={form.safetyChecked}
              onChange={(e) => updateField('safetyChecked', e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-sky-700 focus:ring-sky-600"
            />
            <span className="text-sm leading-relaxed text-slate-700">
              <strong className="font-semibold text-slate-900">디지털 안전 약속 확인</strong> — 본 기획서에
              개인정보(실명, 전화번호, 주소 등)를 입력하지 않았으며, 공공의 이익에 반하지 않는 주제로 작성했습니다.
            </span>
          </label>

          {errorMessage && (
            <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {errorMessage}
            </div>
          )}

          {submitNotice && (
            <div
              role="status"
              className={`mt-4 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm leading-relaxed ${
                submitNotice.kind === 'synced'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {submitNotice.kind === 'synced' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              ) : (
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              )}
              <span>{submitNotice.text}</span>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500 font-mono-tabular">
              {storageConnected
                ? currentDraft?.storageState === 'synced'
                  ? `저장소 저장 시각: ${new Date(currentDraft.updatedAt).toLocaleString('ko-KR')}`
                  : '제출 시 /api/plans 저장소에 기록됩니다.'
                : '저장 준비 중 — 입력 내용은 현재 브라우저에서 바로 점검할 수 있습니다.'}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:w-auto sm:min-h-[44px]"
            >
              <Send className="h-4 w-4" />
              <span>
                {submitting
                  ? '전송 확인 중...'
                  : storageConnected
                    ? '앱 기획서 제출하기'
                    : '입력 내용 확인 및 임시 반영 (저장 준비 중)'}
              </span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
