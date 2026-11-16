import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Lock,
  LogOut,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
import type {
  AppPlanSubmission,
  AppRevisionSubmission,
  EvaluationStage,
  GalleryItem,
  GalleryStatus,
  RubricLevel,
  StageEvaluation,
} from '../types/lesson';
import {
  deleteStudentReportFromApi,
  deleteTeacherGalleryItem,
  loginTeacher,
  logoutTeacher,
  saveStageEvaluationToApi,
  updateTeacherGalleryStatus,
  type BackendMode,
} from '../services/planApi';
import { buildPromptDraft } from '../utils/promptDraft';

const RUBRIC_OPTIONS: RubricLevel[] = ['상', '중', '하', '미확인'];

const RUBRIC_DESCRIPTIONS: { level: Exclude<RubricLevel, '미확인'>; desc: string }[] = [
  {
    level: '상',
    desc: '일상생활 속 문제 상황과 연계하여 웹앱의 화면 구성과 필요한 프로그래밍 원리를 체계적으로 분석·구현함.',
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

function parseNumeric(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return Number.MAX_SAFE_INTEGER;
  const parsed = Number.parseInt(digits, 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function normalizeUnit(raw: string, suffix: string): string {
  return raw.trim().replace(new RegExp(`${suffix}$`), '').trim();
}

function formatGradeText(grade: string): string {
  const g = normalizeUnit(grade, '학년');
  return g ? `${g}학년` : '';
}

function formatClassText(classRoom: string): string {
  const c = normalizeUnit(classRoom, '반');
  return c ? `${c}반` : '';
}

function formatNumberText(studentNumber: string): string {
  const n = normalizeUnit(studentNumber, '번');
  return n ? `${n}번` : '';
}

function buildStudentIdBadge(grade: string, classRoom: string, studentNumber: string): string {
  const numRaw = normalizeUnit(studentNumber, '번');
  if (!numRaw) return '';
  if (numRaw.length >= 4 && /^\d+$/.test(numRaw)) {
    return numRaw;
  }
  const g = normalizeUnit(grade, '학년');
  const c = normalizeUnit(classRoom, '반');
  if (/^\d+$/.test(g) && /^\d+$/.test(c) && /^\d+$/.test(numRaw)) {
    return `${g}${c.padStart(2, '0')}${numRaw.padStart(2, '0')}`;
  }
  return numRaw;
}

function formatFullAuthorLabel(item: {
  grade: string;
  classRoom: string;
  studentNumber: string;
  studentName: string;
}): string {
  return [
    formatGradeText(item.grade),
    formatClassText(item.classRoom),
    formatNumberText(item.studentNumber),
    item.studentName.trim(),
  ]
    .filter(Boolean)
    .join(' ');
}

function escapeCsvCell(value: string): string {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

function rubricBadgeClass(level: RubricLevel): string {
  switch (level) {
    case '상':
      return 'border-blue-200 bg-blue-50 text-blue-800';
    case '중':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case '하':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-500';
  }
}

interface UnifiedStudentPortfolio {
  key: string;
  grade: string;
  classRoom: string;
  studentNumber: string;
  studentName: string;
  classKey: string;
  classLabel: string;
  gradeNum: number;
  classNum: number;
  numberNum: number;
  studentIdBadge: string;
  appTitle: string;
  featuresToImplement: string;
  plan: AppPlanSubmission | null;
  revision: AppRevisionSubmission | null;
  latestUpdatedAt: string;
}

function getStudentMatchKey(grade: string, classRoom: string, studentName: string): string {
  const g = normalizeUnit(grade, '학년').toLowerCase();
  const c = normalizeUnit(classRoom, '반').toLowerCase();
  const name = studentName.trim().toLowerCase();
  return `${g}__${c}__${name}`;
}

function buildUnifiedPortfolios(
  plans: AppPlanSubmission[],
  revisions: AppRevisionSubmission[],
): UnifiedStudentPortfolio[] {
  const map = new Map<string, UnifiedStudentPortfolio>();

  const getMatchKey = getStudentMatchKey;

  for (const plan of plans) {
    const key = getMatchKey(plan.grade, plan.classRoom, plan.studentName);
    const existing = map.get(key);
    const gNum = parseNumeric(plan.grade);
    const cNum = parseNumeric(plan.classRoom);
    const nNum = parseNumeric(plan.studentNumber);
    const classKey = `${normalizeUnit(plan.grade, '학년')}-${normalizeUnit(plan.classRoom, '반')}`;
    const classLabel =
      [formatGradeText(plan.grade), formatClassText(plan.classRoom)].filter(Boolean).join(' ') || '반 미지정';

    if (!existing) {
      map.set(key, {
        key,
        grade: plan.grade,
        classRoom: plan.classRoom,
        studentNumber: plan.studentNumber,
        studentName: plan.studentName,
        classKey,
        classLabel,
        gradeNum: gNum,
        classNum: cNum,
        numberNum: nNum,
        studentIdBadge: buildStudentIdBadge(plan.grade, plan.classRoom, plan.studentNumber),
        appTitle: plan.appTitle?.trim() || '',
        featuresToImplement: plan.featuresToImplement?.trim() || '',
        plan,
        revision: null,
        latestUpdatedAt: plan.updatedAt,
      });
    } else if (!existing.plan || plan.updatedAt > existing.plan.updatedAt) {
      existing.plan = plan;
      if (plan.studentNumber && !existing.studentNumber) {
        existing.studentNumber = plan.studentNumber;
        existing.numberNum = nNum;
        existing.studentIdBadge = buildStudentIdBadge(plan.grade, plan.classRoom, plan.studentNumber);
      }
      if (plan.appTitle?.trim()) existing.appTitle = plan.appTitle.trim();
      if (plan.featuresToImplement?.trim()) existing.featuresToImplement = plan.featuresToImplement.trim();
      if (plan.updatedAt > existing.latestUpdatedAt) existing.latestUpdatedAt = plan.updatedAt;
    }
  }

  for (const rev of revisions) {
    const key = getMatchKey(rev.grade, rev.classRoom, rev.studentName);
    const existing = map.get(key);
    const gNum = parseNumeric(rev.grade);
    const cNum = parseNumeric(rev.classRoom);
    const nNum = parseNumeric(rev.studentNumber);
    const classKey = `${normalizeUnit(rev.grade, '학년')}-${normalizeUnit(rev.classRoom, '반')}`;
    const classLabel =
      [formatGradeText(rev.grade), formatClassText(rev.classRoom)].filter(Boolean).join(' ') || '반 미지정';

    if (!existing) {
      map.set(key, {
        key,
        grade: rev.grade,
        classRoom: rev.classRoom,
        studentNumber: rev.studentNumber,
        studentName: rev.studentName,
        classKey,
        classLabel,
        gradeNum: gNum,
        classNum: cNum,
        numberNum: nNum,
        studentIdBadge: buildStudentIdBadge(rev.grade, rev.classRoom, rev.studentNumber),
        appTitle: '',
        featuresToImplement: '',
        plan: null,
        revision: rev,
        latestUpdatedAt: rev.updatedAt,
      });
    } else {
      if (!existing.revision || rev.updatedAt > existing.revision.updatedAt) {
        existing.revision = rev;
      }
      if (!existing.studentNumber && rev.studentNumber) {
        existing.studentNumber = rev.studentNumber;
        existing.numberNum = nNum;
        existing.studentIdBadge = buildStudentIdBadge(existing.grade, existing.classRoom, rev.studentNumber);
      }
      if (rev.updatedAt > existing.latestUpdatedAt) {
        existing.latestUpdatedAt = rev.updatedAt;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.gradeNum !== b.gradeNum) return a.gradeNum - b.gradeNum;
    if (a.classNum !== b.classNum) return a.classNum - b.classNum;
    if (a.numberNum !== b.numberNum) return a.numberNum - b.numberNum;
    return a.studentName.localeCompare(b.studentName, 'ko-KR');
  });
}

interface ResolvedStageEval {
  discoveryRubric: RubricLevel;
  discoveryNote: string;
  planRubric: RubricLevel;
  planNote: string;
  revisionRubric: RubricLevel;
  revisionNote: string;
}

function resolveEvaluationForPortfolio(
  portfolio: UnifiedStudentPortfolio,
  evaluationMap: Map<string, StageEvaluation>,
): ResolvedStageEval {
  const saved = evaluationMap.get(portfolio.key);
  return {
    discoveryRubric: saved?.discoveryRubric ?? '미확인',
    discoveryNote: saved?.discoveryNote ?? '',
    planRubric:
      saved && saved.planRubric !== '미확인'
        ? saved.planRubric
        : (portfolio.plan?.rubricLevel ?? '미확인'),
    planNote: saved?.planNote || portfolio.plan?.teacherNote || '',
    revisionRubric: saved?.revisionRubric ?? '미확인',
    revisionNote: saved?.revisionNote || portfolio.revision?.teacherNote || '',
  };
}

interface StageEvaluationMenuProps {
  stageLabel: string;
  subtitle: string;
  rubric: RubricLevel;
  note: string;
  saving: boolean;
  notice: { kind: 'ok' | 'err'; text: string } | null;
  onSelectRubric: (level: RubricLevel) => void;
  onNoteChange: (value: string) => void;
  onSaveNote: () => void;
  showRubricGuide?: boolean;
}

function StageEvaluationMenu({
  stageLabel,
  subtitle,
  rubric,
  note,
  saving,
  notice,
  onSelectRubric,
  onNoteChange,
  onSaveNote,
  showRubricGuide = false,
}: StageEvaluationMenuProps) {
  return (
    <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4 print:hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-slate-900">{stageLabel}</span>
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${rubricBadgeClass(rubric)}`}
            >
              현재: {rubric}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-600">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={stageLabel}>
          {RUBRIC_OPTIONS.map((level) => {
            const active = rubric === level;
            const activeColors =
              level === '상'
                ? 'border-blue-700 bg-blue-700 text-white'
                : level === '중'
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : level === '하'
                    ? 'border-amber-600 bg-amber-600 text-white'
                    : 'border-slate-700 bg-slate-700 text-white';
            return (
              <button
                key={level}
                type="button"
                disabled={saving}
                onClick={() => onSelectRubric(level)}
                className={`min-h-[38px] min-w-[54px] rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 ${
                  active
                    ? activeColors
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>

      {showRubricGuide && (
        <div className="mt-2.5 grid gap-1 rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-[11px] text-slate-600">
          {RUBRIC_DESCRIPTIONS.map((item) => (
            <div key={item.level}>
              <strong className="font-bold text-slate-800">{item.level}:</strong> {item.desc}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          maxLength={1000}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={`${stageLabel} 피드백 메모 (선택 입력)`}
          className="min-h-[38px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
        />
        <button
          type="button"
          disabled={saving}
          onClick={onSaveNote}
          className="min-h-[38px] rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          {saving ? '저장 중...' : '평가·메모 저장'}
        </button>
      </div>

      {notice && (
        <div
          role={notice.kind === 'err' ? 'alert' : 'status'}
          className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${
            notice.kind === 'ok' ? 'text-emerald-700' : 'text-red-700'
          }`}
        >
          {notice.kind === 'ok' && <Check className="h-3.5 w-3.5 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}
    </div>
  );
}

interface StudentReportContentProps {
  portfolio: UnifiedStudentPortfolio;
  isPrintView?: boolean;
  onZoomImage?: (payload: { label: string; src: string }) => void;
  evalState?: ResolvedStageEval;
  stageNotesDraft?: Record<EvaluationStage, string>;
  savingStage?: EvaluationStage | null;
  stageNotices?: Partial<Record<EvaluationStage, { kind: 'ok' | 'err'; text: string } | null>>;
  onSelectStageRubric?: (stage: EvaluationStage, level: RubricLevel) => void;
  onStageNoteChange?: (stage: EvaluationStage, value: string) => void;
  onSaveStageNote?: (stage: EvaluationStage) => void;
}

function StudentReportContent({
  portfolio,
  isPrintView = false,
  onZoomImage,
  evalState,
  stageNotesDraft,
  savingStage,
  stageNotices,
  onSelectStageRubric,
  onStageNoteChange,
  onSaveStageNote,
}: StudentReportContentProps) {
  const promptText = portfolio.plan
    ? portfolio.plan.finalPrompt?.trim() ||
      portfolio.plan.promptDraft?.trim() ||
      buildPromptDraft(portfolio.plan)
    : '';

  return (
    <article
      className={
        isPrintView
          ? 'mx-auto max-w-[210mm] rounded-xl border border-slate-300 bg-white p-6 text-slate-950 shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none'
          : 'overflow-hidden rounded-2xl border border-slate-300 bg-white text-slate-950 print:rounded-none print:border-0'
      }
    >
      {/* 보고서 상단 헤더 */}
      <header
        className={
          isPrintView
            ? 'border-b-2 border-slate-900 pb-5'
            : 'border-b border-slate-200 bg-slate-900 px-5 py-5 text-white sm:px-7 sm:py-6 print:border-b-2 print:border-slate-900 print:bg-white print:px-0 print:text-slate-950'
        }
      >
        <div
          className={`flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular ${
            isPrintView ? 'text-blue-800 font-bold' : 'text-blue-300 print:text-slate-700'
          }`}
        >
          <span>고등학교 1학년 정보 · 실생활 문제 해결 웹앱 프로젝트 보고서</span>
          <span>최근 제출: {new Date(portfolio.latestUpdatedAt).toLocaleString('ko-KR')}</span>
        </div>

        <h2
          className={`mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl ${
            isPrintView ? 'text-slate-950' : 'text-white print:text-slate-950'
          }`}
        >
          {portfolio.appTitle || '웹앱 제목 미입력'}
        </h2>

        <div
          className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs ${
            isPrintView ? 'text-slate-700' : 'text-slate-200 print:text-slate-800'
          }`}
        >
          <span className="font-bold">
            작성자: {formatFullAuthorLabel(portfolio)}
            {portfolio.studentIdBadge ? ` (학번 ${portfolio.studentIdBadge})` : ''}
          </span>
          <span aria-hidden="true">·</span>
          <span>1·2차시 문제탐색·앱 기획서: {portfolio.plan ? '제출 완료' : '미제출'}</span>
          <span aria-hidden="true">·</span>
          <span>3차시 수정하기: {portfolio.revision ? '제출 완료' : '미제출'}</span>
        </div>

        {!isPrintView && evalState && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3.5 text-[11px] print:hidden">
            <span className="text-slate-400 font-semibold mr-1">단계별 평가 요약:</span>
            <span className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 font-semibold text-slate-100">
              1. 문제탐색: <strong className="text-blue-300">{evalState.discoveryRubric}</strong>
            </span>
            <span className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 font-semibold text-slate-100">
              2. 앱 기획서: <strong className="text-blue-300">{evalState.planRubric}</strong>
            </span>
            <span className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 font-semibold text-slate-100">
              3. 수정하기: <strong className="text-blue-300">{evalState.revisionRubric}</strong>
            </span>
          </div>
        )}
      </header>

      {/* 단일 페이지 통합 보고서 본문: 1. 문제탐색 -> 2. 앱 기획서 -> 3. 수정하기 */}
      <div className={isPrintView ? 'divide-y divide-slate-300' : 'divide-y divide-slate-200'}>
        {/* 1단계: 문제탐색 */}
        <section className={isPrintView ? 'py-6' : 'p-5 sm:p-7'}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <div className="font-mono-tabular text-[11px] font-bold text-blue-700">STEP 01</div>
              <h3 className="text-base font-extrabold text-slate-950 sm:text-lg">1. 문제탐색</h3>
            </div>
            {portfolio.plan && (
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                탐색 경로: {portfolio.plan.discoverySource}
              </span>
            )}
          </div>

          {!portfolio.plan ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              아직 1단계 [문제탐색] 제출 내역이 없습니다.
            </div>
          ) : (
            <div className="mt-4 space-y-4 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div className="text-xs font-bold text-slate-600">선정한 실생활 문제</div>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-900">
                  {portfolio.plan.problemSummary}
                </p>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-bold text-slate-600">선정 기준 ① 시급성</div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800 sm:text-sm">
                    {portfolio.plan.urgencyReason}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-bold text-slate-600">선정 기준 ② 공공의 이익</div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800 sm:text-sm">
                    {portfolio.plan.publicBenefitReason}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div className="text-xs font-bold text-slate-600">나의 탐구 질문</div>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-900">
                  {portfolio.plan.inquiryQuestion}
                </p>
              </div>
            </div>
          )}

          {!isPrintView && evalState && stageNotesDraft && onSelectStageRubric && onStageNoteChange && onSaveStageNote && (
            <StageEvaluationMenu
              stageLabel="문제탐색 평가"
              subtitle="실생활 문제 정의의 시급성·공공성 및 탐구 질문 구체성을 평가합니다 (클릭 즉시 저장)."
              rubric={evalState.discoveryRubric}
              note={stageNotesDraft.discovery}
              saving={savingStage === 'discovery'}
              notice={stageNotices?.discovery ?? null}
              onSelectRubric={(level) => onSelectStageRubric('discovery', level)}
              onNoteChange={(val) => onStageNoteChange('discovery', val)}
              onSaveNote={() => onSaveStageNote('discovery')}
            />
          )}
        </section>

        {/* 2단계: 앱 기획서 */}
        <section className={isPrintView ? 'py-6' : 'p-5 sm:p-7'}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <div className="font-mono-tabular text-[11px] font-bold text-blue-700">STEP 02</div>
              <h3 className="text-base font-extrabold text-slate-950 sm:text-lg">2. 앱 기획서</h3>
            </div>
            {portfolio.plan && (
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {portfolio.plan.safetyChecked ? '디지털 안전 약속 확인함' : '안전 약속 미확인'}
              </span>
            )}
          </div>

          {!portfolio.plan ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              아직 2단계 [앱 기획서] 제출 내역이 없습니다.
            </div>
          ) : (
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-bold text-slate-600">웹앱 제목</div>
                  <p className="mt-1 font-bold text-slate-900">
                    {portfolio.plan.appTitle || '제목 미입력'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-bold text-slate-600">웹앱 화면 구성 및 구축 절차</div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800 sm:text-sm">
                    {portfolio.plan.screenComposition}
                  </p>
                </div>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-bold text-slate-600">① 구현할 기능</div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800 sm:text-sm">
                    {portfolio.plan.featuresToImplement}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-bold text-slate-600">② 저장할 데이터</div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800 sm:text-sm">
                    {portfolio.plan.dataToStore}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-bold text-slate-600">③ 제약사항</div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800 sm:text-sm">
                    {portfolio.plan.constraints}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-bold text-slate-600">④ 적용할 프로그래밍 원리</div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-800 sm:text-sm">
                    {portfolio.plan.programmingPrinciples}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div className="text-xs font-bold text-slate-600">프롬프트</div>
                <pre
                  className={
                    isPrintView
                      ? 'mt-1.5 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-800'
                      : 'mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-800 print:max-h-none print:overflow-visible'
                  }
                >
                  {promptText}
                </pre>
              </div>
            </div>
          )}

          {!isPrintView && evalState && stageNotesDraft && onSelectStageRubric && onStageNoteChange && onSaveStageNote && (
            <StageEvaluationMenu
              stageLabel="앱 기획서 평가"
              subtitle="화면 구성, 기능·데이터·제약사항·프로그래밍 원리 및 프롬프트 설계를 평가합니다."
              rubric={evalState.planRubric}
              note={stageNotesDraft.plan}
              saving={savingStage === 'plan'}
              notice={stageNotices?.plan ?? null}
              onSelectRubric={(level) => onSelectStageRubric('plan', level)}
              onNoteChange={(val) => onStageNoteChange('plan', val)}
              onSaveNote={() => onSaveStageNote('plan')}
              showRubricGuide
            />
          )}
        </section>

        {/* 3단계: 수정하기 (테스트 및 수정 보완) */}
        <section className={isPrintView ? 'py-6' : 'p-5 sm:p-7'}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <div className="font-mono-tabular text-[11px] font-bold text-blue-700">STEP 03</div>
              <h3 className="text-base font-extrabold text-slate-950 sm:text-lg">
                3. 수정하기 (테스트 및 수정 보완)
              </h3>
            </div>
            {portfolio.revision && (
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 font-mono-tabular">
                수정하기 제출: {new Date(portfolio.revision.updatedAt).toLocaleDateString('ko-KR')}
              </span>
            )}
          </div>

          {!portfolio.revision ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              아직 3단계 [수정하기] 제출 내역이 없습니다.
            </div>
          ) : (
            <div className="mt-4 space-y-5 text-sm">
              {/* 전/후 화면 캡처 */}
              <div>
                <div className="text-xs font-bold text-slate-600">
                  웹앱 화면 변화 비교 (첫 프롬프트 결과 → 수정 후 결과)
                </div>
                <div className="mt-2 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 break-inside-avoid">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">첫 프롬프트 결과 화면</span>
                      {!isPrintView && onZoomImage && (
                        <button
                          type="button"
                          onClick={() =>
                            onZoomImage({
                              label: `${formatFullAuthorLabel(portfolio)} · 첫 프롬프트 결과 화면`,
                              src: portfolio.revision!.beforeImage,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer print:hidden"
                        >
                          <ZoomIn className="h-3 w-3" />
                          <span>크게 보기</span>
                        </button>
                      )}
                    </div>
                    <div
                      onClick={() => {
                        if (!isPrintView && onZoomImage) {
                          onZoomImage({
                            label: `${formatFullAuthorLabel(portfolio)} · 첫 프롬프트 결과 화면`,
                            src: portfolio.revision!.beforeImage,
                          });
                        }
                      }}
                      className={`overflow-hidden rounded border border-slate-200 bg-white ${
                        isPrintView ? '' : 'cursor-zoom-in'
                      }`}
                    >
                      <img
                        src={portfolio.revision.beforeImage}
                        alt="첫 프롬프트 결과 웹앱 화면"
                        className="max-h-64 w-full object-contain bg-slate-100"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 break-inside-avoid">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">수정 결과 바뀐 웹앱 화면</span>
                      {!isPrintView && onZoomImage && (
                        <button
                          type="button"
                          onClick={() =>
                            onZoomImage({
                              label: `${formatFullAuthorLabel(portfolio)} · 수정 결과 바뀐 화면`,
                              src: portfolio.revision!.afterImage,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer print:hidden"
                        >
                          <ZoomIn className="h-3 w-3" />
                          <span>크게 보기</span>
                        </button>
                      )}
                    </div>
                    <div
                      onClick={() => {
                        if (!isPrintView && onZoomImage) {
                          onZoomImage({
                            label: `${formatFullAuthorLabel(portfolio)} · 수정 결과 바뀐 화면`,
                            src: portfolio.revision!.afterImage,
                          });
                        }
                      }}
                      className={`overflow-hidden rounded border border-slate-200 bg-white ${
                        isPrintView ? '' : 'cursor-zoom-in'
                      }`}
                    >
                      <img
                        src={portfolio.revision.afterImage}
                        alt="수정 결과 바뀐 웹앱 화면"
                        className="max-h-64 w-full object-contain bg-slate-100"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 테스트한 것 / 수정한 것 */}
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-bold text-slate-600">① 웹앱을 사용해 보고 테스트한 것</div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-900 sm:text-sm">
                    {portfolio.revision.testedContent}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-bold text-slate-600">② 테스트 후 수정한 것</div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-900 sm:text-sm">
                    {portfolio.revision.fixedAfterTest}
                  </p>
                </div>
              </div>

              {/* 수정 이유와 적용 결과 */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div className="text-xs font-bold text-slate-600">수정한 이유와 적용 결과</div>
                <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-slate-900">
                  {portfolio.revision.reasonAndResult}
                </p>
              </div>
            </div>
          )}

          {!isPrintView && evalState && stageNotesDraft && onSelectStageRubric && onStageNoteChange && onSaveStageNote && (
            <StageEvaluationMenu
              stageLabel="수정하기 평가"
              subtitle="실제 사용 테스트, 오류·개선 반영, 수정 이유 및 결과 설명의 충실도를 평가합니다."
              rubric={evalState.revisionRubric}
              note={stageNotesDraft.revision}
              saving={savingStage === 'revision'}
              notice={stageNotices?.revision ?? null}
              onSelectRubric={(level) => onSelectStageRubric('revision', level)}
              onNoteChange={(val) => onStageNoteChange('revision', val)}
              onSaveNote={() => onSaveStageNote('revision')}
            />
          )}
        </section>
      </div>
    </article>
  );
}

interface TeacherReviewProps {
  backendMode: BackendMode;
  authenticated: boolean;
  plans: AppPlanSubmission[];
  revisions: AppRevisionSubmission[];
  galleryItems: GalleryItem[];
  evaluations: StageEvaluation[];
  printMode: boolean;
  loading: boolean;
  authError: string | null;
  onAuthenticated: () => void;
  onLoggedOut: () => void;
  onRefresh: () => void;
  onPrintModeChange: (printing: boolean) => void;
  onUpdatePlan: (updated: AppPlanSubmission) => void;
  onUpdateRevision: (updated: AppRevisionSubmission) => void;
  onRemoveStudentReport: (params: { studentKey: string; planIds: string[]; revisionIds: string[] }) => void;
  onUpdateGalleryItem: (updated: GalleryItem) => void;
  onRemoveGalleryItem: (id: string) => void;
  onUpdateEvaluation: (updated: StageEvaluation) => void;
}

type TeacherTab = 'portfolio' | 'gallery';

const GALLERY_STATUS_META: Record<GalleryStatus, { label: string; textClass: string }> = {
  pending: { label: '승인 대기', textClass: 'text-amber-700' },
  approved: { label: '게시 완료', textClass: 'text-emerald-700' },
  rejected: { label: '보류', textClass: 'text-slate-500' },
};

export default function TeacherReview({
  backendMode,
  authenticated,
  plans,
  revisions,
  galleryItems,
  evaluations,
  printMode,
  loading,
  authError,
  onAuthenticated,
  onLoggedOut,
  onRefresh,
  onPrintModeChange,
  onUpdatePlan,
  onUpdateRevision,
  onRemoveStudentReport,
  onUpdateGalleryItem,
  onRemoveGalleryItem,
  onUpdateEvaluation,
}: TeacherReviewProps) {
  const [activeTab, setActiveTab] = useState<TeacherTab>('portfolio');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [selectedClassKey, setSelectedClassKey] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentKey, setSelectedStudentKey] = useState<string | null>(null);

  const [stageNotesDraft, setStageNotesDraft] = useState<Record<EvaluationStage, string>>({
    discovery: '',
    plan: '',
    revision: '',
  });
  const [savingStage, setSavingStage] = useState<EvaluationStage | null>(null);
  const [stageNotices, setStageNotices] = useState<
    Partial<Record<EvaluationStage, { kind: 'ok' | 'err'; text: string } | null>>
  >({});

  const [confirmDeleteReport, setConfirmDeleteReport] = useState(false);
  const [deletingReport, setDeletingReport] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [zoomedImage, setZoomedImage] = useState<{ label: string; src: string } | null>(null);

  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryStatusFilter, setGalleryStatusFilter] = useState<'all' | GalleryStatus>('all');
  const [busyGalleryId, setBusyGalleryId] = useState<string | null>(null);
  const [confirmDeleteGalleryId, setConfirmDeleteGalleryId] = useState<string | null>(null);
  const [galleryNotice, setGalleryNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const portfolios = useMemo(() => buildUnifiedPortfolios(plans, revisions), [plans, revisions]);

  const evaluationMap = useMemo(() => {
    const map = new Map<string, StageEvaluation>();
    for (const item of evaluations) {
      map.set(item.studentKey, item);
    }
    return map;
  }, [evaluations]);

  const classOptions = useMemo(() => {
    const map = new Map<
      string,
      { classKey: string; classLabel: string; gradeNum: number; classNum: number; count: number }
    >();
    for (const p of portfolios) {
      const prev = map.get(p.classKey);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(p.classKey, {
          classKey: p.classKey,
          classLabel: p.classLabel,
          gradeNum: p.gradeNum,
          classNum: p.classNum,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.gradeNum !== b.gradeNum) return a.gradeNum - b.gradeNum;
      return a.classNum - b.classNum;
    });
  }, [portfolios]);

  const filteredPortfolios = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return portfolios.filter((p) => {
      const matchesClass = selectedClassKey === 'all' || p.classKey === selectedClassKey;
      const authorText = formatFullAuthorLabel(p).toLowerCase();
      const matchesQuery =
        !q ||
        authorText.includes(q) ||
        p.studentIdBadge.toLowerCase().includes(q) ||
        p.studentName.toLowerCase().includes(q) ||
        p.appTitle.toLowerCase().includes(q) ||
        p.featuresToImplement.toLowerCase().includes(q) ||
        (p.plan?.problemSummary.toLowerCase().includes(q) ?? false);
      return matchesClass && matchesQuery;
    });
  }, [portfolios, selectedClassKey, searchQuery]);

  const selectedPortfolio = useMemo(() => {
    if (!selectedStudentKey) return null;
    return filteredPortfolios.find((p) => p.key === selectedStudentKey) ?? null;
  }, [filteredPortfolios, selectedStudentKey]);

  const selectedPortfolioIndex = useMemo(() => {
    if (!selectedPortfolio) return -1;
    return filteredPortfolios.findIndex((p) => p.key === selectedPortfolio.key);
  }, [filteredPortfolios, selectedPortfolio]);

  const selectedEvalState = useMemo(() => {
    if (!selectedPortfolio) return undefined;
    return resolveEvaluationForPortfolio(selectedPortfolio, evaluationMap);
  }, [selectedPortfolio, evaluationMap]);

  useEffect(() => {
    if (!selectedPortfolio) {
      setStageNotesDraft({ discovery: '', plan: '', revision: '' });
      setStageNotices({});
      setConfirmDeleteReport(false);
      setDeletingReport(false);
      setDeleteNotice(null);
      if (printMode) onPrintModeChange(false);
      return;
    }
    const resolved = resolveEvaluationForPortfolio(selectedPortfolio, evaluationMap);
    setStageNotesDraft({
      discovery: resolved.discoveryNote,
      plan: resolved.planNote,
      revision: resolved.revisionNote,
    });
    setStageNotices({});
    setConfirmDeleteReport(false);
    setDeletingReport(false);
    setDeleteNotice(null);
  }, [selectedPortfolio?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    if (!password.trim()) {
      setLoginError('교사 비밀번호를 입력해 주세요.');
      return;
    }

    setLoggingIn(true);
    try {
      const res = await loginTeacher(password);
      if (res.authenticated) {
        setPassword('');
        onAuthenticated();
      } else {
        setLoginError(res.error || '로그인에 실패했습니다.');
      }
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    onPrintModeChange(false);
    await logoutTeacher();
    onLoggedOut();
  }

  async function persistStageEvaluation(stage: EvaluationStage, rubric: RubricLevel, note: string) {
    if (!selectedPortfolio) return;
    setSavingStage(stage);
    setStageNotices((prev) => ({ ...prev, [stage]: null }));

    try {
      const res = await saveStageEvaluationToApi({
        studentKey: selectedPortfolio.key,
        stage,
        rubric,
        note,
        planId: selectedPortfolio.plan?.id ?? null,
        revisionId: selectedPortfolio.revision?.id ?? null,
      });

      if (res.unauthorized) {
        onPrintModeChange(false);
        onLoggedOut();
        return;
      }

      if (res.ok && res.evaluation) {
        onUpdateEvaluation(res.evaluation);
        if (stage === 'plan' && selectedPortfolio.plan) {
          onUpdatePlan({
            ...selectedPortfolio.plan,
            rubricLevel: rubric,
            teacherNote: note,
          });
        }
        if (stage === 'revision' && selectedPortfolio.revision) {
          onUpdateRevision({
            ...selectedPortfolio.revision,
            teacherNote: note,
          });
        }
        const stageTitle =
          stage === 'discovery' ? '문제탐색' : stage === 'plan' ? '앱 기획서' : '수정하기';
        setStageNotices((prev) => ({
          ...prev,
          [stage]: { kind: 'ok', text: `${stageTitle} 평가(${rubric})가 저장되었습니다.` },
        }));
      } else {
        setStageNotices((prev) => ({
          ...prev,
          [stage]: { kind: 'err', text: res.error || '평가 저장에 실패했습니다.' },
        }));
      }
    } finally {
      setSavingStage(null);
    }
  }

  function handleSelectStageRubric(stage: EvaluationStage, level: RubricLevel) {
    const note = stageNotesDraft[stage];
    void persistStageEvaluation(stage, level, note);
  }

  function handleSaveStageNote(stage: EvaluationStage) {
    if (!selectedEvalState) return;
    const rubric =
      stage === 'discovery'
        ? selectedEvalState.discoveryRubric
        : stage === 'plan'
          ? selectedEvalState.planRubric
          : selectedEvalState.revisionRubric;
    void persistStageEvaluation(stage, rubric, stageNotesDraft[stage]);
  }

  async function handleDeleteStudentReport(portfolio: UnifiedStudentPortfolio) {
    const planIds = plans
      .filter((p) => getStudentMatchKey(p.grade, p.classRoom, p.studentName) === portfolio.key)
      .map((p) => p.id);
    const revisionIds = revisions
      .filter((r) => getStudentMatchKey(r.grade, r.classRoom, r.studentName) === portfolio.key)
      .map((r) => r.id);

    setDeletingReport(true);
    setDeleteNotice(null);
    try {
      const res = await deleteStudentReportFromApi({
        studentKey: portfolio.key,
        planIds,
        revisionIds,
      });
      if (res.unauthorized) {
        onPrintModeChange(false);
        onLoggedOut();
        return;
      }
      if (res.ok) {
        onRemoveStudentReport({
          studentKey: portfolio.key,
          planIds,
          revisionIds,
        });
        setConfirmDeleteReport(false);
        onPrintModeChange(false);
        setSelectedStudentKey(null);
      } else {
        setDeleteNotice({ kind: 'err', text: res.error || '학생 보고서 삭제에 실패했습니다.' });
      }
    } finally {
      setDeletingReport(false);
    }
  }

  async function handleGalleryStatusChange(id: string, nextStatus: GalleryStatus) {
    setBusyGalleryId(id);
    setGalleryNotice(null);
    try {
      const res = await updateTeacherGalleryStatus(id, nextStatus);
      if (res.unauthorized) {
        onLoggedOut();
        return;
      }
      if (res.ok && res.item) {
        onUpdateGalleryItem(res.item);
        const statusMsg =
          nextStatus === 'approved'
            ? '갤러리 게시가 승인되었습니다.'
            : nextStatus === 'rejected'
              ? '해당 항목을 보류 처리했습니다.'
              : '해당 항목을 승인 대기 상태로 전환했습니다.';
        setGalleryNotice({ kind: 'ok', text: statusMsg });
      } else {
        setGalleryNotice({ kind: 'err', text: res.error || '상태 변경에 실패했습니다.' });
      }
    } finally {
      setBusyGalleryId(null);
    }
  }

  async function handleDeleteGalleryItem(id: string) {
    setBusyGalleryId(id);
    setGalleryNotice(null);
    try {
      const res = await deleteTeacherGalleryItem(id);
      if (res.unauthorized) {
        onLoggedOut();
        return;
      }
      if (res.ok) {
        onRemoveGalleryItem(id);
        setConfirmDeleteGalleryId(null);
        setGalleryNotice({ kind: 'ok', text: '갤러리 신청 항목을 삭제했습니다.' });
      } else {
        setGalleryNotice({ kind: 'err', text: res.error || '항목 삭제에 실패했습니다.' });
      }
    } finally {
      setBusyGalleryId(null);
    }
  }

  const filteredGalleryItems = useMemo(() => {
    const q = gallerySearch.trim().toLowerCase();
    return galleryItems.filter((item) => {
      const matchesStatus = galleryStatusFilter === 'all' || item.status === galleryStatusFilter;
      const matchesQuery =
        !q ||
        item.studentId.toLowerCase().includes(q) ||
        item.studentName.toLowerCase().includes(q) ||
        item.intro.toLowerCase().includes(q) ||
        item.appUrl.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [galleryItems, gallerySearch, galleryStatusFilter]);

  function handleExportUnifiedCsv() {
    const headers = [
      '학년',
      '반',
      '번호',
      '학번',
      '성명',
      '웹앱 제목',
      '탐색 경로',
      '선정한 실생활 문제',
      '시급성 이유',
      '공공의 이익 이유',
      '탐구 질문',
      '1단계 문제탐색 평가(상/중/하)',
      '1단계 교사 메모',
      '웹앱 화면 구성',
      '구현할 기능',
      '저장할 데이터',
      '제약사항',
      '적용할 프로그래밍 원리',
      '프롬프트',
      '안전 약속 확인',
      '2단계 앱 기획서 평가(상/중/하)',
      '2단계 교사 메모',
      '3차시 웹앱 테스트한 것',
      '3차시 테스트 후 수정한 것',
      '3차시 수정 이유 및 적용 결과',
      '3단계 수정하기 평가(상/중/하)',
      '3단계 교사 메모',
      '최근 제출 시각',
    ];
    const rows = filteredPortfolios.map((item) => {
      const ev = resolveEvaluationForPortfolio(item, evaluationMap);
      return [
        item.grade,
        item.classRoom,
        item.studentNumber,
        item.studentIdBadge,
        item.studentName,
        item.appTitle,
        item.plan?.discoverySource ?? '',
        item.plan?.problemSummary ?? '',
        item.plan?.urgencyReason ?? '',
        item.plan?.publicBenefitReason ?? '',
        item.plan?.inquiryQuestion ?? '',
        ev.discoveryRubric,
        ev.discoveryNote,
        item.plan?.screenComposition ?? '',
        item.featuresToImplement,
        item.plan?.dataToStore ?? '',
        item.plan?.constraints ?? '',
        item.plan?.programmingPrinciples ?? '',
        item.plan
          ? item.plan.finalPrompt?.trim() || item.plan.promptDraft?.trim() || buildPromptDraft(item.plan)
          : '',
        item.plan ? (item.plan.safetyChecked ? '확인' : '미확인') : '',
        ev.planRubric,
        ev.planNote,
        item.revision?.testedContent ?? '',
        item.revision?.fixedAfterTest ?? '',
        item.revision?.reasonAndResult ?? '',
        ev.revisionRubric,
        ev.revisionNote,
        new Date(item.latestUpdatedAt).toLocaleString('ko-KR'),
      ];
    });

    const csvContent =
      '\uFEFF' +
      [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `학생프로젝트_통합확인_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const pendingGalleryCount = galleryItems.filter((g) => g.status === 'pending').length;
  const approvedGalleryCount = galleryItems.filter((g) => g.status === 'approved').length;

  // 전용 출력 화면: 출력하기 클릭 시 학생이 제출한 보고서만 출력되는 깔끔한 전용 화면으로 연결
  if (authenticated && printMode && selectedPortfolio) {
    return (
      <section className="min-h-screen bg-slate-200/70 px-4 py-6 sm:px-6 print:min-h-0 print:bg-white print:p-0">
        <div className="mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onPrintModeChange(false)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>교사확인으로 돌아가기</span>
            </button>
            <span className="text-xs font-semibold text-slate-600 hidden sm:inline">
              출력 전용 화면 · {formatFullAuthorLabel(selectedPortfolio)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedPortfolioIndex <= 0}
              onClick={() => {
                const prev = filteredPortfolios[selectedPortfolioIndex - 1];
                if (prev) setSelectedStudentKey(prev.key);
              }}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>이전 학생</span>
            </button>
            <button
              type="button"
              disabled={selectedPortfolioIndex < 0 || selectedPortfolioIndex >= filteredPortfolios.length - 1}
              onClick={() => {
                const next = filteredPortfolios[selectedPortfolioIndex + 1];
                if (next) setSelectedStudentKey(next.key);
              }}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <span>다음 학생</span>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 transition-colors cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>인쇄 / PDF 저장</span>
            </button>
          </div>
        </div>

        <StudentReportContent portfolio={selectedPortfolio} isPrintView />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-6 print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono-tabular text-xs font-semibold text-slate-600">
            <span className="text-blue-700">교사확인 · 통합 프로젝트 점검 및 단계별 평가</span>
            <span aria-hidden="true">·</span>
            <span>
              {backendMode === 'checking'
                ? '연결 확인 중'
                : backendMode === 'ready'
                  ? 'D1 저장소 연결됨 (/api)'
                  : backendMode === 'db_uninitialized'
                    ? 'D1 테이블 미생성 (setup.sql 필요)'
                    : '저장 준비 중 (/api 미연결)'}
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            교사 확인 및 학생별 통합 포트폴리오
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            학생이 작성한 문제탐색 · 앱 기획서 · 수정하기 보고서를 한 페이지로 확인하고, 각 단계별로 상·중·하 평가를 입력하거나 보고서만 출력할 수 있습니다.
          </p>
        </div>

        {authenticated && (
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
            >
              <RefreshCw className="h-4 w-4" />
              <span>응답 새로고침</span>
            </button>

            {activeTab === 'portfolio' && (
              <button
                type="button"
                onClick={handleExportUnifiedCsv}
                disabled={filteredPortfolios.length === 0}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
              >
                <Download className="h-4 w-4" />
                <span>CSV 내보내기</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:flex-initial"
            >
              <LogOut className="h-4 w-4" />
              <span>로그아웃</span>
            </button>
          </div>
        )}
      </div>

      {backendMode !== 'ready' && backendMode !== 'checking' && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs leading-relaxed text-amber-900 sm:text-sm print:hidden">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              {backendMode === 'db_uninitialized' ? (
                <>
                  <strong className="font-semibold">D1 데이터베이스 테이블 미생성</strong> — Cloudflare D1 Console에서
                  `setup.sql`을 실행한 뒤 다시 확인해 주세요.
                </>
              ) : (
                <>
                  <strong className="font-semibold">저장 준비 중 (/api 미연결)</strong> — 현재 Preview 환경에는
                  Cloudflare Worker와 `TEACHER_PASSWORD` Secret이 연결되어 있지 않습니다. Cloudflare 발행 및 D1·시크릿
                  설정 후 로그인하여 학생 응답을 확인할 수 있습니다.
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Teacher Login Panel */}
      {!authenticated ? (
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 print:hidden">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Lock className="h-4 w-4 text-blue-700 shrink-0" />
            <span>교사 인증 로그인</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            서버에 설정된 <span className="font-mono-tabular font-semibold text-slate-800">TEACHER_PASSWORD</span>{' '}
            비밀번호로 인증하며, 로그인 시 보호된 세션 쿠키(`HttpOnly`)가 발급됩니다.
          </p>

          <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="teacherPassword" className="block text-xs font-medium text-slate-700">
                교사 비밀번호
              </label>
              <input
                id="teacherPassword"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (loginError) setLoginError(null);
                }}
                placeholder="교사 비밀번호 입력"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
              />
            </div>

            {(loginError || authError) && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                {loginError || authError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="min-h-[44px] w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {loggingIn ? '인증 확인 중...' : '로그인'}
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4 print:hidden">
            <button
              type="button"
              onClick={() => {
                setActiveTab('portfolio');
                onPrintModeChange(false);
              }}
              className={`min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer sm:text-sm ${
                activeTab === 'portfolio'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              학생별 통합 확인 ({portfolios.length}명)
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('gallery');
                onPrintModeChange(false);
              }}
              className={`min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer sm:text-sm ${
                activeTab === 'gallery'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              공개 갤러리 인증 ({galleryItems.length}
              {pendingGalleryCount > 0 ? ` · 대기 ${pendingGalleryCount}` : ''})
            </button>
          </div>

          {authError && (
            <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 print:hidden">
              {authError}
            </div>
          )}

          {activeTab === 'portfolio' ? (
            selectedPortfolio ? (
              /* 학생 1명의 문제탐색 + 앱 기획서 + 수정하기 통합 단일 보고서 페이지 */
              <div className="mt-6 space-y-5 print:mt-0">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3.5 sm:px-6 print:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      onPrintModeChange(false);
                      setSelectedStudentKey(null);
                    }}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>제출 학생 목록으로</span>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={selectedPortfolioIndex <= 0}
                      onClick={() => {
                        const prev = filteredPortfolios[selectedPortfolioIndex - 1];
                        if (prev) setSelectedStudentKey(prev.key);
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>이전 학생</span>
                    </button>
                    <button
                      type="button"
                      disabled={selectedPortfolioIndex < 0 || selectedPortfolioIndex >= filteredPortfolios.length - 1}
                      onClick={() => {
                        const next = filteredPortfolios[selectedPortfolioIndex + 1];
                        if (next) setSelectedStudentKey(next.key);
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    >
                      <span>다음 학생</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onPrintModeChange(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-800 transition-colors cursor-pointer"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>출력하기</span>
                    </button>
                  </div>
                </div>

                <StudentReportContent
                  portfolio={selectedPortfolio}
                  onZoomImage={setZoomedImage}
                  evalState={selectedEvalState}
                  stageNotesDraft={stageNotesDraft}
                  savingStage={savingStage}
                  stageNotices={stageNotices}
                  onSelectStageRubric={handleSelectStageRubric}
                  onStageNoteChange={(stage, val) =>
                    setStageNotesDraft((prev) => ({ ...prev, [stage]: val }))
                  }
                  onSaveStageNote={handleSaveStageNote}
                />

                {/* 하단 보고서 삭제 (해당 학생 보고서 전체 삭제 - 출력 시 숨김) */}
                <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 sm:px-6 print:hidden">
                  {confirmDeleteReport ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-red-700">
                        {formatFullAuthorLabel(selectedPortfolio)} 학생의 보고서 전체를 삭제할까요?
                      </span>
                      <button
                        type="button"
                        disabled={deletingReport}
                        onClick={() => handleDeleteStudentReport(selectedPortfolio)}
                        className="min-h-[40px] rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                      >
                        {deletingReport ? '삭제 중...' : '전체 삭제 확인'}
                      </button>
                      <button
                        type="button"
                        disabled={deletingReport}
                        onClick={() => setConfirmDeleteReport(false)}
                        className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteReport(true)}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>이 학생 보고서 삭제하기</span>
                    </button>
                  )}
                </div>

                {deleteNotice && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 print:hidden"
                  >
                    {deleteNotice.text}
                  </div>
                )}
              </div>
            ) : (
              /* 학번순 정렬 · 반별 필터 · 학생 목록 */
              <>
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-medium text-slate-500">제출 학생 수</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">
                      {portfolios.length}명
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-medium text-slate-500">최근 제출 시각</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 font-mono-tabular">
                      {portfolios[0]
                        ? new Date(portfolios[0].latestUpdatedAt).toLocaleString('ko-KR')
                        : '제출 내역 없음'}
                    </div>
                  </div>
                </div>

                {/* 반 선택 필터 + 검색 */}
                <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs font-bold text-slate-700">반별 보기:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedClassKey('all')}
                      className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        selectedClassKey === 'all'
                          ? 'bg-blue-700 text-white'
                          : 'border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      전체 반 ({portfolios.length})
                    </button>
                    {classOptions.map((cls) => {
                      const active = selectedClassKey === cls.classKey;
                      return (
                        <button
                          key={cls.classKey}
                          type="button"
                          onClick={() => setSelectedClassKey(cls.classKey)}
                          className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                            active
                              ? 'bg-blue-700 text-white'
                              : 'border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {cls.classLabel} ({cls.count})
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="학년·반·학번·이름, 웹앱 제목, 구현할 기능으로 검색"
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
                    />
                  </div>
                </div>

                {/* 학생 카드 그리드 */}
                {loading ? (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                    제출된 학생 기록을 불러오는 중입니다...
                  </div>
                ) : filteredPortfolios.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center sm:p-12">
                    <p className="text-sm font-medium text-slate-800">표시할 제출 학생이 없습니다.</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                      학생이 문제탐색, 앱 기획서, 수정하기를 제출하면 반별·학번순으로 표시됩니다.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredPortfolios.map((item) => {
                      const ev = resolveEvaluationForPortfolio(item, evaluationMap);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSelectedStudentKey(item.key)}
                          className="group flex flex-col justify-between rounded-xl border border-slate-300 bg-white p-5 text-left transition-colors hover:border-blue-600 hover:bg-blue-50/30 cursor-pointer"
                        >
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-700">
                                <span>{formatGradeText(item.grade)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{formatClassText(item.classRoom)}</span>
                                <span aria-hidden="true">·</span>
                                <span className="text-sm font-extrabold text-slate-950">{item.studentName}</span>
                              </div>
                              {item.studentIdBadge && (
                                <span className="rounded bg-slate-900 px-2 py-0.5 font-mono-tabular text-[11px] font-bold text-white">
                                  {item.studentIdBadge}
                                </span>
                              )}
                            </div>

                            <h2 className="mt-3 text-base font-extrabold tracking-tight text-blue-800 group-hover:text-blue-700 line-clamp-2">
                              {item.appTitle || '웹앱 제목 미입력'}
                            </h2>

                            <div className="mt-2.5">
                              <div className="text-[11px] font-semibold text-slate-500">구현할 기능</div>
                              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                                {item.featuresToImplement || '아직 앱 기획서가 제출되지 않았습니다.'}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-3">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className={`rounded border px-1.5 py-0.5 font-semibold ${rubricBadgeClass(ev.discoveryRubric)}`}>
                                탐색:{ev.discoveryRubric === '미확인' ? '-' : ev.discoveryRubric}
                              </span>
                              <span className={`rounded border px-1.5 py-0.5 font-semibold ${rubricBadgeClass(ev.planRubric)}`}>
                                기획:{ev.planRubric === '미확인' ? '-' : ev.planRubric}
                              </span>
                              <span className={`rounded border px-1.5 py-0.5 font-semibold ${rubricBadgeClass(ev.revisionRubric)}`}>
                                수정:{ev.revisionRubric === '미확인' ? '-' : ev.revisionRubric}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span className="font-mono-tabular">
                                {item.plan ? '기획서 ○' : '기획서 -'} · {item.revision ? '수정하기 ○' : '수정하기 -'}
                              </span>
                              <span className="font-semibold text-blue-700 group-hover:underline">
                                보고서·평가 보기 →
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )
          ) : (
            <div className="mt-6">
              {/* Gallery summary metrics */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">전체 등록 신청</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">
                    {galleryItems.length}건
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">승인 대기</div>
                  <div className="mt-1 text-2xl font-bold text-amber-700 font-mono-tabular">
                    {pendingGalleryCount}건
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">갤러리 게시 완료</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-700 font-mono-tabular">
                    {approvedGalleryCount}건
                  </div>
                </div>
              </div>

              {/* Gallery search & filter */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 sm:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={gallerySearch}
                    onChange={(e) => setGallerySearch(e.target.value)}
                    placeholder="학번, 이름, 소개글, URL로 검색"
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:text-sm"
                  />
                </div>

                <select
                  value={galleryStatusFilter}
                  onChange={(e) => setGalleryStatusFilter(e.target.value as 'all' | GalleryStatus)}
                  aria-label="갤러리 인증 상태 필터"
                  className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-700 focus:border-blue-700 focus:outline-none sm:text-sm"
                >
                  <option value="all">상태: 전체</option>
                  <option value="pending">승인 대기</option>
                  <option value="approved">게시 완료</option>
                  <option value="rejected">보류</option>
                </select>
              </div>

              {galleryNotice && (
                <div
                  role={galleryNotice.kind === 'err' ? 'alert' : 'status'}
                  className={`mt-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-xs sm:text-sm ${
                    galleryNotice.kind === 'ok'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  {galleryNotice.kind === 'ok' && <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />}
                  <span>{galleryNotice.text}</span>
                </div>
              )}

              {loading ? (
                <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                  갤러리 신청 목록을 불러오는 중입니다...
                </div>
              ) : filteredGalleryItems.length === 0 ? (
                <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center sm:p-12">
                  <p className="text-sm font-medium text-slate-800">표시할 갤러리 등록 신청이 없습니다.</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    학생이 갤러리 메뉴에서 본인 웹페이지를 등록하면 이곳에서 인증 및 게시 여부를 결정할 수 있습니다.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {filteredGalleryItems.map((item) => {
                    const statusMeta = GALLERY_STATUS_META[item.status];
                    const busy = busyGalleryId === item.id;
                    return (
                      <article
                        key={item.id}
                        className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className={`font-semibold ${statusMeta.textClass}`}>{statusMeta.label}</span>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="font-mono-tabular font-semibold text-slate-800">{item.studentId}</span>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="font-semibold text-slate-900">{item.studentName}</span>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="font-mono-tabular text-slate-500">
                                {new Date(item.updatedAt).toLocaleString('ko-KR')}
                              </span>
                            </div>

                            <a
                              href={item.appUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline break-all font-mono-tabular"
                            >
                              <span>{item.appUrl}</span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            </a>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {item.status !== 'approved' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleGalleryStatusChange(item.id, 'approved')}
                                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>인증 · 게시</span>
                              </button>
                            )}

                            {item.status !== 'rejected' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleGalleryStatusChange(item.id, 'rejected')}
                                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                보류
                              </button>
                            )}

                            {item.status !== 'pending' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleGalleryStatusChange(item.id, 'pending')}
                                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                대기 전환
                              </button>
                            )}

                            {confirmDeleteGalleryId === item.id ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDeleteGalleryItem(item.id)}
                                  className="min-h-[44px] rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                                >
                                  삭제 확인
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setConfirmDeleteGalleryId(null)}
                                  className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmDeleteGalleryId(item.id)}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:border-red-200 hover:text-red-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>삭제</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="mt-3.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                          {item.intro}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {zoomedImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoomedImage.label}
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 print:hidden"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-700 bg-white"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
              <span className="text-sm font-bold text-slate-900 truncate">{zoomedImage.label}</span>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
                <span>닫기</span>
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto bg-slate-100 p-4">
              <img
                src={zoomedImage.src}
                alt={zoomedImage.label}
                className="mx-auto max-h-[75vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
