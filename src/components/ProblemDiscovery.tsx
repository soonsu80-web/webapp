import { ArrowRight } from 'lucide-react';
import type { AppPlanInput, DiscoverySource } from '../types/lesson';

const DISCOVERY_SOURCES: DiscoverySource[] = [
  '기사',
  '주변 지역사회 주민 인터뷰',
  '가족과의 대화',
  '친구와의 브레인스토밍',
  '수업 중 학교문제 토론',
  '기타 일상 관찰',
];

interface ProblemDiscoveryProps {
  form: AppPlanInput;
  onUpdateField: <K extends keyof AppPlanInput>(key: K, value: AppPlanInput[K]) => void;
  onNextStep: () => void;
}

export default function ProblemDiscovery({
  form,
  onUpdateField,
  onNextStep,
}: ProblemDiscoveryProps) {
  const isDiscoveryReady =
    form.grade.trim().length > 0 &&
    form.classRoom.trim().length > 0 &&
    form.studentNumber.trim().length > 0 &&
    form.studentName.trim().length > 0 &&
    form.problemSummary.trim().length > 0 &&
    form.urgencyReason.trim().length > 0 &&
    form.publicBenefitReason.trim().length > 0 &&
    form.inquiryQuestion.trim().length > 0;

  return (
    <section id="problem-discovery" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="border-b border-slate-300 pb-5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono-tabular text-xs font-semibold text-slate-600">
          <span className="text-blue-700">1차시 · 문제탐색</span>
          <span aria-hidden="true">·</span>
          <span>[들어가기] (현상)관찰하기 · (문제)질문하기</span>
        </div>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
          일상 속 실생활 문제 탐색 및 탐구 질문 설정
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          작성자 정보를 입력한 뒤, 일상에서 발견한 문제를 시급성과 공공의 이익 기준으로 정리하세요.
        </p>
      </div>

      <div className="mt-6 space-y-6 sm:space-y-8">
        {/* 작성자 정보 (학년 · 반 · 성명) */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6">
          <div>
            <span className="text-sm font-semibold text-slate-900">작성자 정보 (개인)</span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
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
                onChange={(e) => onUpdateField('grade', e.target.value)}
                placeholder="예: 1"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
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
                onChange={(e) => onUpdateField('classRoom', e.target.value)}
                placeholder="예: 3"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="authorNumber" className="block text-xs font-medium text-slate-700">
                번호
              </label>
              <input
                id="authorNumber"
                type="text"
                inputMode="numeric"
                maxLength={20}
                value={form.studentNumber}
                onChange={(e) => onUpdateField('studentNumber', e.target.value)}
                placeholder="예: 5"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
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
                onChange={(e) => onUpdateField('studentName', e.target.value)}
                placeholder="예:홍길동"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
            </div>
          </div>
        </div>

        {/* 문제 탐색 및 선정 기준 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">01. (현상)관찰하기</div>
            <h2 className="mt-0.5 text-base font-bold text-slate-900">
              실생활 문제 탐색 경로 및 문제 선정
            </h2>
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
                    onClick={() => onUpdateField('discoverySource', source)}
                    className={`min-h-[44px] rounded-lg border px-3.5 py-2.5 text-left text-sm font-semibold transition-colors cursor-pointer sm:text-xs ${
                      selected
                        ? 'border-blue-700 bg-blue-50 text-blue-950'
                        : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
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
              onChange={(e) => onUpdateField('problemSummary', e.target.value)}
              placeholder="기사, 대화, 학교생활 관찰 등에서 발견한 문제 상황을 구체적으로 적어 주세요."
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
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
                onChange={(e) => onUpdateField('urgencyReason', e.target.value)}
                placeholder="이 문제가 지금 당장 해결되어야 하는 이유를 적어 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
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
                onChange={(e) => onUpdateField('publicBenefitReason', e.target.value)}
                placeholder="이 웹앱이 나뿐만 아니라 주변 친구·가족·지역사회에 어떤 도움이 되는지 적어 주세요."
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
            </div>
          </div>
        </div>

        {/* 탐구 질문 */}
        <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-xs font-medium text-slate-500">02. (문제)질문하기</div>
            <h2 className="mt-0.5 text-base font-bold text-slate-900">
              나의 탐구 질문 정하기
            </h2>
          </div>

          <div>
            <label htmlFor="inquiryQuestion" className="block text-sm font-medium text-slate-800">
              ‘어떤 전략과 과정을 거칠까?’ 중심 탐구 질문
            </label>
            <textarea
              id="inquiryQuestion"
              rows={3}
              maxLength={1000}
              value={form.inquiryQuestion}
              onChange={(e) => onUpdateField('inquiryQuestion', e.target.value)}
              placeholder="발견한 실생활 문제를 어떤 절차와 원리로 해결할 수 있을지 궁금한 점을 질문으로 정리해 주세요."
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
            />
          </div>
        </div>

        {/* Next step action */}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="text-xs text-slate-600">
            {isDiscoveryReady
              ? '문제탐색 입력이 준비되었습니다. 다음 페이지에서 앱 기획서를 완성하세요.'
              : '입력한 내용은 자동으로 유지되며, 다음 단계인 앱 기획서 페이지로 이어집니다.'}
          </div>
          <button
            type="button"
            onClick={onNextStep}
            className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:w-auto"
          >
            <span>다음: 앱 기획서 작성</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
