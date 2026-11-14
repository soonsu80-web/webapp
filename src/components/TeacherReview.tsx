import { useEffect, useMemo, useState } from 'react';
import { Check, Clock, Download, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { AppPlanSubmission, RubricLevel } from '../types/lesson';
import { deletePlanFromApi, saveTeacherReviewToApi } from '../services/planApi';

const RUBRIC_DESCRIPTIONS: { level: Exclude<RubricLevel, '미확인'>; desc: string }[] = [
  {
    level: '상',
    desc: '일상생활 속 문제 상황과 연계하여 웹앱의 화면 구성과 필요한 프로그래밍 원리를 체계적으로 분석하여 설명함.',
  },
  {
    level: '중',
    desc: '주어진 문제 상황에 맞추어 웹앱의 화면 구성과 프로그래밍 요소를 파악하여 제시함.',
  },
  {
    level: '하',
    desc: '안내된 양식에 따라 웹앱의 화면 구성 요소를 나열함.',
  },
];

function escapeCsvCell(value: string): string {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

function formatAuthorLabel(plan: AppPlanSubmission): string {
  const g = plan.grade.trim();
  const c = plan.classRoom.trim();
  const n = plan.studentName.trim();
  const gradeText = g ? (g.endsWith('학년') ? g : `${g}학년`) : '';
  const classText = c ? (c.endsWith('반') ? c : `${c}반`) : '';
  return [gradeText, classText, n].filter(Boolean).join(' ');
}

interface TeacherReviewProps {
  storageConnected: boolean | null;
  plans: AppPlanSubmission[];
  loading: boolean;
  onRefresh: () => void;
  onUpdatePlan: (updated: AppPlanSubmission) => void;
  onRemovePlan: (id: string) => void;
}

export default function TeacherReview({
  storageConnected,
  plans,
  loading,
  onRefresh,
  onUpdatePlan,
  onRemovePlan,
}: TeacherReviewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('전체');

  const [rubricDraft, setRubricDraft] = useState<RubricLevel>('미확인');
  const [noteDraft, setNoteDraft] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<{ kind: 'synced' | 'pending'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return plans.filter((p) => {
      const matchesSource = sourceFilter === '전체' || p.discoverySource === sourceFilter;
      const authorText = formatAuthorLabel(p).toLowerCase();
      const matchesQuery =
        !q ||
        authorText.includes(q) ||
        p.studentName.toLowerCase().includes(q) ||
        p.problemSummary.toLowerCase().includes(q) ||
        p.featuresToImplement.toLowerCase().includes(q);
      return matchesSource && matchesQuery;
    });
  }, [plans, searchQuery, sourceFilter]);

  const selectedPlan = useMemo(() => {
    if (selectedId) {
      const exact = filteredPlans.find((p) => p.id === selectedId);
      if (exact) return exact;
    }
    return filteredPlans[0] ?? null;
  }, [filteredPlans, selectedId]);

  useEffect(() => {
    if (selectedPlan) {
      setRubricDraft(selectedPlan.rubricLevel);
      setNoteDraft(selectedPlan.teacherNote);
      setReviewNotice(null);
      setConfirmDeleteId(null);
    }
  }, [selectedPlan]);

  async function handleSaveReview() {
    if (!selectedPlan) return;
    setSavingReview(true);
    setReviewNotice(null);

    try {
      if (selectedPlan.storageState === 'synced') {
        const res = await saveTeacherReviewToApi(selectedPlan.id, rubricDraft, noteDraft);
        if (res.connected && res.plan) {
          onUpdatePlan(res.plan);
          setReviewNotice({ kind: 'synced', text: '교사 확인 내용이 저장소에 반영되었습니다.' });
          return;
        }
      }

      onUpdatePlan({
        ...selectedPlan,
        rubricLevel: rubricDraft,
        teacherNote: noteDraft,
      });
      setReviewNotice({
        kind: 'pending',
        text: '저장 준비 중: 서버 저장소(/api)가 연결되지 않아 현재 브라우저 세션 화면에만 반영되었습니다.',
      });
    } finally {
      setSavingReview(false);
    }
  }

  async function handleDeletePlan(id: string) {
    const target = plans.find((p) => p.id === id);
    if (target?.storageState === 'synced') {
      await deletePlanFromApi(id);
    }
    onRemovePlan(id);
    setConfirmDeleteId(null);
    setSelectedId(null);
  }

  function handleExportCsv() {
    const headers = [
      '학년',
      '반',
      '성명',
      '저장 상태',
      '탐색 경로',
      '선정한 실생활 문제',
      '시급성 이유',
      '공공의 이익 이유',
      '탐구 질문',
      '웹앱 화면 구성',
      '구현할 기능',
      '저장할 데이터',
      '제약사항',
      '적용할 프로그래밍 원리',
      '안전 약속 확인',
      '평가 확인(상/중/하)',
      '교사 메모',
      '작성 시각',
    ];
    const rows = plans.map((p) => [
      p.grade,
      p.classRoom,
      p.studentName,
      p.storageState === 'synced' ? '저장됨' : '저장 준비 중(임시)',
      p.discoverySource,
      p.problemSummary,
      p.urgencyReason,
      p.publicBenefitReason,
      p.inquiryQuestion,
      p.screenComposition,
      p.featuresToImplement,
      p.dataToStore,
      p.constraints,
      p.programmingPrinciples,
      p.safetyChecked ? '확인' : '미확인',
      p.rubricLevel,
      p.teacherNote,
      new Date(p.updatedAt).toLocaleString('ko-KR'),
    ]);

    const csvContent =
      '\uFEFF' + [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `1차시_앱기획서_확인목록_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const reviewedCount = plans.filter((p) => p.rubricLevel !== '미확인').length;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-500">
            <span className="font-semibold text-sky-700">교사 확인 화면 · 평가 요소 ①</span>
            <span aria-hidden="true">·</span>
            <span>
              {storageConnected === null
                ? '저장소 연결 확인 중'
                : storageConnected
                  ? '저장소 연결됨 (/api/plans)'
                  : '저장 준비 중 (/api/plans 미연결)'}
            </span>
          </div>
          <h2 className="mt-1.5 text-xl font-bold text-slate-900 sm:text-2xl">
            1차시 앱 기획서 확인 및 열람
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            일상생활 속 문제 해결을 위한 웹앱의 화면 구성과 프로그래밍 원리 분석 내용을 확인합니다.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
          >
            <RefreshCw className="h-4 w-4" />
            <span>연결 다시 확인</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={plans.length === 0}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
          >
            <Download className="h-4 w-4" />
            <span>CSV 내보내기</span>
          </button>
        </div>
      </div>

      {storageConnected === false && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs leading-relaxed text-amber-900 sm:text-sm">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <strong className="font-semibold">저장 준비 중 — 데이터 저장소(`/api/plans`) 미연결</strong>.
              다른 기기에서 접속한 학생들의 응답을 모아 보려면 3차시에 Cloudflare Workers와 D1을 연결해야 합니다.
              아래 목록에는 현재 브라우저의 ‘학생 활동’ 화면에서 방금 입력해 확인한 임시 작성본만 표시됩니다.
            </div>
          </div>
        </div>
      )}

      {/* Summary metrics */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">
            {storageConnected ? '제출된 기획서' : '현재 브라우저 임시 확인본'}
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">{plans.length}건</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">교사 확인 완료</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">
            {reviewedCount} / {plans.length}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">저장소 상태</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {storageConnected === null
              ? '확인 중...'
              : storageConnected
                ? '연결됨 (/api/plans)'
                : '저장 준비 중 (3차시 D1 연결 예정)'}
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="학년·반·성명, 문제 내용, 기능으로 검색"
            className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
          />
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          aria-label="탐색 경로 필터"
          className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-700 focus:border-sky-600 focus:outline-none sm:text-sm"
        >
          <option value="전체">탐색 경로: 전체</option>
          <option value="기사">기사</option>
          <option value="주변 지역사회 주민 인터뷰">주변 지역사회 주민 인터뷰</option>
          <option value="가족과의 대화">가족과의 대화</option>
          <option value="친구와의 브레인스토밍">친구와의 브레인스토밍</option>
          <option value="수업 중 학교문제 토론">수업 중 학교문제 토론</option>
          <option value="기타 일상 관찰">기타 일상 관찰</option>
        </select>
      </div>

      {/* Main split */}
      {loading ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          저장소 상태를 확인하는 중입니다...
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center sm:p-12">
          <p className="text-sm font-medium text-slate-800">
            {storageConnected
              ? '아직 제출된 앱 기획서가 없습니다.'
              : '표시할 임시 작성본이 아직 없습니다.'}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            {storageConnected
              ? '학생이 앱 기획서를 작성해 제출하면 이곳에서 바로 확인할 수 있습니다.'
              : '학생 활동 화면에서 기획서를 작성하고 ‘입력 내용 확인 및 임시 반영’을 누르면 교사 확인 화면의 동작을 바로 점검할 수 있습니다.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-start">
          {/* List */}
          <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-4">
            {filteredPlans.map((plan) => {
              const active = selectedPlan?.id === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedId(plan.id)}
                  className={`min-h-[60px] w-full px-4 py-3.5 text-left transition-colors cursor-pointer ${
                    active ? 'bg-sky-50' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {formatAuthorLabel(plan)}
                    </span>
                    <span
                      className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                        plan.rubricLevel === '미확인' ? 'text-slate-400' : 'text-sky-700'
                      }`}
                    >
                      평가: {plan.rubricLevel}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{plan.problemSummary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono-tabular">
                    <span className="truncate">{plan.discoverySource}</span>
                    <span aria-hidden="true">·</span>
                    <span>{plan.storageState === 'synced' ? '저장됨' : '임시 확인용(미저장)'}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail Inspector */}
          {selectedPlan && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 lg:col-span-8">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{selectedPlan.discoverySource}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {selectedPlan.storageState === 'synced' ? '저장소 저장됨' : '저장 준비 중 (브라우저 임시본)'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedPlan.safetyChecked ? '안전 약속 확인함' : '안전 약속 미확인'}</span>
                  </div>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">
                    {formatAuthorLabel(selectedPlan)}
                  </h3>
                </div>

                <div>
                  {confirmDeleteId === selectedPlan.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeletePlan(selectedPlan.id)}
                        className="min-h-[44px] rounded-lg bg-red-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-700 cursor-pointer whitespace-nowrap"
                      >
                        삭제 확인
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selectedPlan.id)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:border-red-200 hover:text-red-700 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>목록에서 지우기</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-6 text-sm">
                <div>
                  <h4 className="text-xs font-semibold text-sky-700">1. 선정한 실생활 문제 및 선정 이유</h4>
                  <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-slate-900">
                    {selectedPlan.problemSummary}
                  </p>
                  <div className="mt-3 grid gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-slate-500">시급성</div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                        {selectedPlan.urgencyReason}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">공공의 이익</div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                        {selectedPlan.publicBenefitReason}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-5">
                  <h4 className="text-xs font-semibold text-sky-700">2. 탐구 질문 및 웹앱 화면 구성</h4>
                  <div className="mt-2 space-y-3">
                    <div>
                      <div className="text-xs font-medium text-slate-500">탐구 질문</div>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-900">
                        {selectedPlan.inquiryQuestion}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">웹앱의 화면 구성과 필요 요소</div>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-800">
                        {selectedPlan.screenComposition}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-5">
                  <h4 className="text-xs font-semibold text-sky-700">3. 앱 기획서 핵심 설계</h4>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-slate-500">구현할 기능</div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                        {selectedPlan.featuresToImplement}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">저장할 데이터</div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                        {selectedPlan.dataToStore}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">제약사항</div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                        {selectedPlan.constraints}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">적용할 프로그래밍 원리</div>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                        {selectedPlan.programmingPrinciples}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 평가 요소 ① 확인 기록 */}
                <div className="border-t border-slate-200 pt-5">
                  <h4 className="text-xs font-semibold text-slate-900">
                    교사 평가 확인 기록 (평가 요소 ①: 웹앱의 화면 구성과 프로그래밍 원리 분석)
                  </h4>

                  <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {(['미확인', '상', '중', '하'] as RubricLevel[]).map((level) => {
                      const active = rubricDraft === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setRubricDraft(level)}
                          className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer sm:text-xs ${
                            active
                              ? 'border-sky-700 bg-sky-700 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {level}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-500">
                    {RUBRIC_DESCRIPTIONS.map((item) => (
                      <div key={item.level}>
                        <span className="font-semibold text-slate-700">{item.level}:</span> {item.desc}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <label htmlFor="teacherNote" className="block text-xs font-medium text-slate-700">
                      교사 피드백 메모
                    </label>
                    <textarea
                      id="teacherNote"
                      rows={2}
                      maxLength={1000}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="2차시 프롬프트 구조화 전 보완할 점이나 피드백을 기록하세요."
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
                    />
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs">
                      {reviewNotice && (
                        <span
                          className={`inline-flex items-start gap-1.5 ${
                            reviewNotice.kind === 'synced' ? 'text-emerald-700' : 'text-amber-800'
                          }`}
                        >
                          {reviewNotice.kind === 'synced' ? (
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>{reviewNotice.text}</span>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveReview}
                      disabled={savingReview}
                      className="min-h-[44px] w-full rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap sm:w-auto"
                    >
                      {savingReview ? '확인 중...' : storageConnected ? '확인 결과 저장' : '확인 결과 임시 반영'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
