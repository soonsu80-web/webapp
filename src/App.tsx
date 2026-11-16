import { useCallback, useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import LessonOverview from './components/LessonOverview';
import ProblemDiscovery from './components/ProblemDiscovery';
import AppPlanForm from './components/AppPlanForm';
import RevisionPage from './components/RevisionPage';
import GalleryPage from './components/GalleryPage';
import TeacherReview from './components/TeacherReview';
import type {
  AppPlanInput,
  AppPlanSubmission,
  AppRevisionSubmission,
  EditingReportSession,
  GalleryItem,
  StageEvaluation,
  StudentLookupIdentity,
} from './types/lesson';
import {
  checkBackendHealth,
  checkTeacherSession,
  fetchTeacherEvaluations,
  fetchTeacherGallery,
  fetchTeacherPlans,
  fetchTeacherRevisions,
  type BackendMode,
} from './services/planApi';
import { buildPromptDraft } from './utils/promptDraft';

type PageKey = 'overview' | 'discovery' | 'plan' | 'revision' | 'gallery' | 'teacher';

const MENU_ITEMS: { key: PageKey; label: string }[] = [
  { key: 'overview', label: '수업안내' },
  { key: 'discovery', label: '문제탐색' },
  { key: 'plan', label: '앱 기획서' },
  { key: 'revision', label: '수정하기' },
  { key: 'gallery', label: '갤러리' },
  { key: 'teacher', label: '교사확인' },
];

const SESSION_FORM_KEY = 'vibe_coding_p1_form_input';
const SESSION_REVISION_KEY = 'vibe_coding_p3_revision_input';
const SESSION_EDITING_KEY = 'vibe_coding_editing_report';
const EDIT_ALLOWED_PAGES: ReadonlySet<PageKey> = new Set(['discovery', 'plan', 'revision']);

export interface RevisionDraftState {
  beforeImage: string;
  testedItems: string[];
  fixedItems: string[];
  afterImage: string;
  reasonAndResult: string;
  safetyChecked: boolean;
}

const EMPTY_INPUT: AppPlanInput = {
  grade: '',
  classRoom: '',
  studentNumber: '',
  studentName: '',
  discoverySource: '수업 중 학교문제 토론',
  problemSummary: '',
  urgencyReason: '',
  publicBenefitReason: '',
  inquiryQuestion: '',
  appTitle: '',
  screenComposition: '',
  featuresToImplement: '',
  dataToStore: '',
  constraints: '',
  programmingPrinciples: '',
  finalPrompt: '',
  safetyChecked: false,
};

const EMPTY_REVISION_DRAFT: RevisionDraftState = {
  beforeImage: '',
  testedItems: [''],
  fixedItems: [''],
  afterImage: '',
  reasonAndResult: '',
  safetyChecked: false,
};

function normalizeSentenceArray(arr: unknown, fallbackText: unknown): string[] {
  if (Array.isArray(arr)) {
    const items = arr.map((v) => (typeof v === 'string' ? v : ''));
    return items.length > 0 ? items : [''];
  }
  if (typeof fallbackText === 'string' && fallbackText.trim()) {
    const lines = fallbackText
      .split(/\r?\n/)
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean);
    return lines.length > 0 ? lines : [''];
  }
  return [''];
}

function loadSessionForm(): AppPlanInput {
  try {
    const raw = window.sessionStorage.getItem(SESSION_FORM_KEY);
    if (!raw) return EMPTY_INPUT;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_INPUT, ...parsed };
  } catch {
    return EMPTY_INPUT;
  }
}

function loadSessionRevision(): RevisionDraftState {
  try {
    const raw = window.sessionStorage.getItem(SESSION_REVISION_KEY);
    if (!raw) return EMPTY_REVISION_DRAFT;
    const parsed = JSON.parse(raw) as Partial<RevisionDraftState> & {
      testedContent?: string;
      fixedAfterTest?: string;
      beforeCode?: string;
      afterCode?: string;
    };
    return {
      beforeImage: typeof parsed.beforeImage === 'string' ? parsed.beforeImage : '',
      testedItems: normalizeSentenceArray(parsed.testedItems, parsed.testedContent ?? parsed.beforeCode),
      fixedItems: normalizeSentenceArray(parsed.fixedItems, parsed.fixedAfterTest ?? parsed.afterCode),
      afterImage: typeof parsed.afterImage === 'string' ? parsed.afterImage : '',
      reasonAndResult: typeof parsed.reasonAndResult === 'string' ? parsed.reasonAndResult : '',
      safetyChecked: parsed.safetyChecked === true,
    };
  } catch {
    return EMPTY_REVISION_DRAFT;
  }
}

function loadSessionEditing(): EditingReportSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_EDITING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditingReportSession>;
    if (!parsed?.active || !parsed.lookup) return null;
    return {
      active: true,
      planId: typeof parsed.planId === 'string' ? parsed.planId : null,
      revisionId: typeof parsed.revisionId === 'string' ? parsed.revisionId : null,
      lookup: parsed.lookup,
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>(() => {
    const editing = loadSessionEditing();
    return editing?.active ? 'discovery' : 'overview';
  });
  const [backendMode, setBackendMode] = useState<BackendMode>('checking');
  const [teacherAuthenticated, setTeacherAuthenticated] = useState(false);
  const [plans, setPlans] = useState<AppPlanSubmission[]>([]);
  const [revisions, setRevisions] = useState<AppRevisionSubmission[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [stageEvaluations, setStageEvaluations] = useState<StageEvaluation[]>([]);
  const [teacherPrintMode, setTeacherPrintMode] = useState(false);
  const [lastSavedPlan, setLastSavedPlan] = useState<AppPlanSubmission | null>(null);
  const [lastSavedRevision, setLastSavedRevision] = useState<AppRevisionSubmission | null>(null);
  const [formInput, setFormInput] = useState<AppPlanInput>(loadSessionForm);
  const [revisionDraft, setRevisionDraft] = useState<RevisionDraftState>(loadSessionRevision);
  const [editingReport, setEditingReport] = useState<EditingReportSession | null>(loadSessionEditing);
  const [editNavBlockedOpen, setEditNavBlockedOpen] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);

  const loadTeacherData = useCallback(async () => {
    setLoadingPlans(true);
    setTeacherError(null);
    const [plansRes, revisionsRes, galleryRes, evaluationsRes] = await Promise.all([
      fetchTeacherPlans(),
      fetchTeacherRevisions(),
      fetchTeacherGallery(),
      fetchTeacherEvaluations(),
    ]);
    if (
      plansRes.unauthorized ||
      revisionsRes.unauthorized ||
      galleryRes.unauthorized ||
      evaluationsRes.unauthorized
    ) {
      setTeacherAuthenticated(false);
      setPlans([]);
      setRevisions([]);
      setGalleryItems([]);
      setStageEvaluations([]);
      setTeacherPrintMode(false);
      setTeacherError(
        plansRes.error ||
          revisionsRes.error ||
          galleryRes.error ||
          evaluationsRes.error ||
          '교사 로그인이 필요합니다.',
      );
    } else if (!plansRes.connected || !revisionsRes.connected || !galleryRes.connected) {
      setBackendMode('unavailable');
      setPlans([]);
      setRevisions([]);
      setGalleryItems([]);
      setStageEvaluations([]);
      setTeacherError(
        plansRes.error || revisionsRes.error || galleryRes.error || '저장소와 연결되지 않았습니다.',
      );
    } else if (plansRes.error || revisionsRes.error || galleryRes.error) {
      setPlans(plansRes.plans);
      setRevisions(revisionsRes.revisions);
      setGalleryItems(galleryRes.items);
      setStageEvaluations(evaluationsRes.evaluations);
      setTeacherError(plansRes.error || revisionsRes.error || galleryRes.error || null);
    } else {
      setBackendMode('ready');
      setPlans(plansRes.plans);
      setRevisions(revisionsRes.revisions);
      setGalleryItems(galleryRes.items);
      setStageEvaluations(evaluationsRes.evaluations);
    }
    setLoadingPlans(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const [health, session] = await Promise.all([checkBackendHealth(), checkTeacherSession()]);
      if (cancelled) return;
      setBackendMode(health.mode);
      if (session.connected && session.authenticated) {
        setTeacherAuthenticated(true);
        await loadTeacherData();
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [loadTeacherData]);

  function handleUpdateField<K extends keyof AppPlanInput>(key: K, value: AppPlanInput[K]) {
    setFormInput((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.sessionStorage.setItem(SESSION_FORM_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota issues
      }
      return next;
    });
  }

  function handleUpdateRevisionField<K extends keyof RevisionDraftState>(
    key: K,
    value: RevisionDraftState[K],
  ) {
    setRevisionDraft((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.sessionStorage.setItem(SESSION_REVISION_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota issues
      }
      return next;
    });
  }

  function handleResetDraft() {
    setLastSavedPlan(null);
    setFormInput(EMPTY_INPUT);
    try {
      window.sessionStorage.removeItem(SESSION_FORM_KEY);
    } catch {
      // Ignore
    }
  }

  function handleResetRevisionDraft() {
    setLastSavedRevision(null);
    setRevisionDraft(EMPTY_REVISION_DRAFT);
    try {
      window.sessionStorage.removeItem(SESSION_REVISION_KEY);
    } catch {
      // Ignore
    }
  }

  function handleLoadedReportForEdit({
    plan,
    revision,
    lookup,
  }: {
    plan: AppPlanSubmission | null;
    revision: AppRevisionSubmission | null;
    lookup: StudentLookupIdentity;
  }) {
    const autoDraft = plan ? buildPromptDraft(plan) : '';
    const loadedFinalPrompt =
      plan && plan.finalPrompt && plan.finalPrompt.trim() !== autoDraft.trim()
        ? plan.finalPrompt
        : '';

    const nextForm: AppPlanInput = plan
      ? {
          grade: plan.grade || lookup.grade,
          classRoom: plan.classRoom || lookup.classRoom,
          studentNumber: plan.studentNumber || lookup.studentNumber,
          studentName: plan.studentName || lookup.studentName,
          discoverySource: plan.discoverySource,
          problemSummary: plan.problemSummary,
          urgencyReason: plan.urgencyReason,
          publicBenefitReason: plan.publicBenefitReason,
          inquiryQuestion: plan.inquiryQuestion,
          appTitle: plan.appTitle ?? '',
          screenComposition: plan.screenComposition,
          featuresToImplement: plan.featuresToImplement,
          dataToStore: plan.dataToStore,
          constraints: plan.constraints,
          programmingPrinciples: plan.programmingPrinciples,
          finalPrompt: loadedFinalPrompt,
          safetyChecked: plan.safetyChecked,
        }
      : {
          ...EMPTY_INPUT,
          grade: revision?.grade || lookup.grade,
          classRoom: revision?.classRoom || lookup.classRoom,
          studentNumber: revision?.studentNumber || lookup.studentNumber,
          studentName: revision?.studentName || lookup.studentName,
        };

    const nextRevision: RevisionDraftState = revision
      ? {
          beforeImage: revision.beforeImage,
          testedItems: normalizeSentenceArray(undefined, revision.testedContent),
          fixedItems: normalizeSentenceArray(undefined, revision.fixedAfterTest),
          afterImage: revision.afterImage,
          reasonAndResult: revision.reasonAndResult,
          safetyChecked: true,
        }
      : {
          ...EMPTY_REVISION_DRAFT,
          safetyChecked: plan?.safetyChecked ?? false,
        };

    const nextEditing: EditingReportSession = {
      active: true,
      planId: plan?.id ?? null,
      revisionId: revision?.id ?? null,
      lookup,
    };

    setFormInput(nextForm);
    setRevisionDraft(nextRevision);
    setLastSavedPlan(plan);
    setLastSavedRevision(revision);
    setEditingReport(nextEditing);
    setEditNavBlockedOpen(false);

    try {
      window.sessionStorage.setItem(SESSION_FORM_KEY, JSON.stringify(nextForm));
      window.sessionStorage.setItem(SESSION_REVISION_KEY, JSON.stringify(nextRevision));
      window.sessionStorage.setItem(SESSION_EDITING_KEY, JSON.stringify(nextEditing));
    } catch {
      // Ignore storage quota issues
    }

    setActivePage('discovery');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleEditCompleted({
    plan,
    revision,
  }: {
    plan: AppPlanSubmission | null;
    revision: AppRevisionSubmission | null;
  }) {
    if (plan) {
      setLastSavedPlan(plan);
      if (teacherAuthenticated) {
        setPlans((prev) => {
          const exists = prev.some((item) => item.id === plan.id);
          return exists ? prev.map((item) => (item.id === plan.id ? plan : item)) : [plan, ...prev];
        });
      }
    }
    if (revision) {
      setLastSavedRevision(revision);
      if (teacherAuthenticated) {
        setRevisions((prev) => {
          const exists = prev.some((item) => item.id === revision.id);
          return exists
            ? prev.map((item) => (item.id === revision.id ? revision : item))
            : [revision, ...prev];
        });
      }
    }
    setEditingReport(null);
    setEditNavBlockedOpen(false);
    try {
      window.sessionStorage.removeItem(SESSION_EDITING_KEY);
    } catch {
      // Ignore
    }
  }

  function handlePlanSaved(plan: AppPlanSubmission) {
    setLastSavedPlan(plan);
    if (editingReport?.active) {
      const updatedEditing: EditingReportSession = { ...editingReport, planId: plan.id };
      setEditingReport(updatedEditing);
      try {
        window.sessionStorage.setItem(SESSION_EDITING_KEY, JSON.stringify(updatedEditing));
      } catch {
        // Ignore
      }
    }
    if (teacherAuthenticated) {
      setPlans((prev) => {
        const exists = prev.some((item) => item.id === plan.id);
        return exists ? prev.map((item) => (item.id === plan.id ? plan : item)) : [plan, ...prev];
      });
    }
  }

  function handleRevisionSaved(revision: AppRevisionSubmission) {
    setLastSavedRevision(revision);
    if (teacherAuthenticated) {
      setRevisions((prev) => [revision, ...prev]);
    }
  }

  function handleUpdatePlan(updated: AppPlanSubmission) {
    setPlans((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }

  function handleRemovePlan(id: string) {
    setPlans((prev) => prev.filter((item) => item.id !== id));
  }

  function handleUpdateRevision(updated: AppRevisionSubmission) {
    setRevisions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }

  function handleRemoveRevision(id: string) {
    setRevisions((prev) => prev.filter((item) => item.id !== id));
  }

  function handleUpdateGalleryItem(updated: GalleryItem) {
    setGalleryItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }

  function handleRemoveGalleryItem(id: string) {
    setGalleryItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleUpdateEvaluation(updated: StageEvaluation) {
    setStageEvaluations((prev) => {
      const exists = prev.some((item) => item.studentKey === updated.studentKey);
      return exists
        ? prev.map((item) => (item.studentKey === updated.studentKey ? updated : item))
        : [updated, ...prev];
    });
  }

  function navigateToPage(page: PageKey) {
    if (editingReport?.active && !EDIT_ALLOWED_PAGES.has(page)) {
      setEditNavBlockedOpen(true);
      return;
    }
    if (page !== 'teacher' && teacherPrintMode) {
      setTeacherPrintMode(false);
    }
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const isPrintScreenActive = activePage === 'teacher' && teacherPrintMode;

  return (
    <div className="min-h-screen flex flex-col bg-[#eef2f6] text-slate-950 print:bg-white">
      {/* Top Navigation Bar */}
      {!isPrintScreenActive && (
        <header className="sticky top-0 z-30 border-b border-slate-700 bg-slate-900 text-white print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              navigateToPage('overview');
            }}
            className="text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 sm:text-xl"
          >
            바이브 코딩 프로젝트
          </a>

          <nav aria-label="주요 메뉴" className="hidden md:flex items-center gap-1.5 lg:gap-2">
            {MENU_ITEMS.map((item) => {
              const active = activePage === item.key;
              const lockedInEdit = Boolean(editingReport?.active && !EDIT_ALLOWED_PAGES.has(item.key));
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigateToPage(item.key)}
                  className={`inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3.5 py-2 text-[15px] font-bold tracking-tight transition-colors whitespace-nowrap shrink-0 cursor-pointer lg:px-4 lg:text-base ${
                    active
                      ? 'bg-blue-500 text-white'
                      : lockedInEdit
                        ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {lockedInEdit && <Lock className="h-3.5 w-3.5 shrink-0" />}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        </header>
      )}

      {/* Non-sticky mobile navigation strip */}
      {!isPrintScreenActive && (
        <nav aria-label="모바일 메뉴" className="border-b border-slate-700 bg-slate-800 px-4 py-2.5 md:hidden print:hidden">
          <div className="flex items-center gap-2 overflow-x-auto">
            {MENU_ITEMS.map((item) => {
              const active = activePage === item.key;
              const lockedInEdit = Boolean(editingReport?.active && !EDIT_ALLOWED_PAGES.has(item.key));
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigateToPage(item.key)}
                  className={`inline-flex min-h-[46px] items-center gap-1 rounded-lg px-4 py-2.5 text-sm font-bold tracking-tight transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-blue-500 text-white'
                      : lockedInEdit
                        ? 'bg-slate-700/60 text-slate-400 hover:bg-slate-700'
                        : 'bg-slate-700 text-slate-100 hover:bg-slate-600 hover:text-white'
                  }`}
                >
                  {lockedInEdit && <Lock className="h-3.5 w-3.5 shrink-0" />}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {editingReport?.active && (
        <div className="border-b border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-950 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <div className="leading-relaxed">
              <strong className="font-bold text-blue-900">
                보고서 수정 중 ({editingReport.lookup.grade}학년 {editingReport.lookup.classRoom}반{' '}
                {editingReport.lookup.studentNumber}번 {editingReport.lookup.studentName})
              </strong>{' '}
              — ‘문제탐색’, ‘앱 기획서’, ‘수정하기’ 3개 메뉴에서 내용을 수정한 뒤, [수정하기] 페이지의{' '}
              <strong className="font-bold">‘보고서 제출하기’</strong> 버튼을 눌러 갱신을 완료해 주세요.
            </div>
            {activePage !== 'revision' && (
              <button
                type="button"
                onClick={() => navigateToPage('revision')}
                className="inline-flex min-h-[36px] items-center rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                수정하기(제출)로 이동
              </button>
            )}
          </div>
        </div>
      )}

      <main id="top" className="flex-1">
        {activePage === 'overview' && (
          <LessonOverview
            onStartDiscovery={() => navigateToPage('discovery')}
            onLoadedReportForEdit={handleLoadedReportForEdit}
          />
        )}

        {activePage === 'discovery' && (
          <ProblemDiscovery
            form={formInput}
            onUpdateField={handleUpdateField}
            onNextStep={() => navigateToPage('plan')}
          />
        )}

        {activePage === 'plan' && (
          <AppPlanForm
            form={formInput}
            onUpdateField={handleUpdateField}
            onGoToDiscovery={() => navigateToPage('discovery')}
            onGoToRevision={() => navigateToPage('revision')}
            backendMode={backendMode}
            lastSavedPlan={lastSavedPlan}
            onPlanSaved={handlePlanSaved}
            onBackendModeChange={setBackendMode}
            onResetDraft={handleResetDraft}
            editingReport={editingReport}
          />
        )}

        {activePage === 'revision' && (
          <RevisionPage
            authorForm={{
              grade: formInput.grade,
              classRoom: formInput.classRoom,
              studentNumber: formInput.studentNumber,
              studentName: formInput.studentName,
              problemSummary: formInput.problemSummary,
              appTitle: formInput.appTitle,
            }}
            fullPlanForm={formInput}
            onGoToDiscovery={() => navigateToPage('discovery')}
            onGoToPlan={() => navigateToPage('plan')}
            revisionDraft={revisionDraft}
            onUpdateRevisionField={handleUpdateRevisionField}
            onResetRevisionDraft={handleResetRevisionDraft}
            backendMode={backendMode}
            lastSavedRevision={lastSavedRevision}
            onRevisionSaved={handleRevisionSaved}
            onBackendModeChange={setBackendMode}
            editingReport={editingReport}
            onEditCompleted={handleEditCompleted}
          />
        )}

        {activePage === 'gallery' && <GalleryPage backendMode={backendMode} />}

        {activePage === 'teacher' && (
          <TeacherReview
            backendMode={backendMode}
            authenticated={teacherAuthenticated}
            plans={plans}
            revisions={revisions}
            galleryItems={galleryItems}
            evaluations={stageEvaluations}
            printMode={teacherPrintMode}
            loading={loadingPlans}
            authError={teacherError}
            onAuthenticated={() => {
              setTeacherAuthenticated(true);
              setTeacherError(null);
              loadTeacherData();
            }}
            onLoggedOut={() => {
              setTeacherAuthenticated(false);
              setPlans([]);
              setRevisions([]);
              setGalleryItems([]);
              setStageEvaluations([]);
              setTeacherPrintMode(false);
              setTeacherError(null);
            }}
            onRefresh={loadTeacherData}
            onPrintModeChange={setTeacherPrintMode}
            onUpdatePlan={handleUpdatePlan}
            onRemovePlan={handleRemovePlan}
            onUpdateRevision={handleUpdateRevision}
            onRemoveRevision={handleRemoveRevision}
            onUpdateGalleryItem={handleUpdateGalleryItem}
            onRemoveGalleryItem={handleRemoveGalleryItem}
            onUpdateEvaluation={handleUpdateEvaluation}
          />
        )}
      </main>

      {editNavBlockedOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-nav-blocked-title"
          onClick={() => setEditNavBlockedOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 text-slate-900 shadow-xl"
          >
            <div className="flex items-center gap-2 text-base font-extrabold text-slate-950">
              <Lock className="h-4 w-4 text-blue-700 shrink-0" />
              <h2 id="edit-nav-blocked-title">보고서 수정 중 이동 제한</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              보고서 수정 중에는 <strong className="font-semibold text-slate-900">문제탐색 · 앱 기획서 · 수정하기</strong> 메뉴만 이동할 수 있습니다.
              <br />
              <span className="mt-1.5 inline-block">
                [수정하기] 페이지에서 <strong className="font-bold text-blue-700">‘보고서 제출하기’</strong> 버튼을 눌러 내용을 갱신한 뒤에 다른 페이지로 이동해 주세요.
              </span>
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditNavBlockedOpen(false)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                계속 수정하기
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditNavBlockedOpen(false);
                  setActivePage('revision');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="min-h-[44px] rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 cursor-pointer"
              >
                수정하기(보고서 제출)로 이동
              </button>
            </div>
          </div>
        </div>
      )}

      {!isPrintScreenActive && (
        <footer className="border-t border-slate-300 bg-white print:hidden">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 text-xs text-slate-500 sm:px-6">
            <span>코드를 읽고 다시 쓰는 바이브 코딩 프로젝트 · 고등학교 1학년 정보</span>
            <span>
              {backendMode === 'ready'
                ? '데이터 저장소 연결됨 (Cloudflare D1)'
                : backendMode === 'db_uninitialized'
                  ? 'D1 테이블 준비 필요 (setup.sql)'
                  : '저장 준비 중 · Cloudflare Workers + D1 연결 예정'}
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}
