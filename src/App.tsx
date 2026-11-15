import { useCallback, useEffect, useState } from 'react';
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
  CodeChangePair,
  GalleryItem,
} from './types/lesson';
import {
  checkBackendHealth,
  checkTeacherSession,
  fetchTeacherGallery,
  fetchTeacherPlans,
  fetchTeacherRevisions,
  type BackendMode,
} from './services/planApi';

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

export interface RevisionDraftState {
  beforeImage: string;
  codeChanges: CodeChangePair[];
  afterImage: string;
  reasonAndResult: string;
}

const EMPTY_INPUT: AppPlanInput = {
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
  finalPrompt: '',
  safetyChecked: false,
};

const EMPTY_REVISION_DRAFT: RevisionDraftState = {
  beforeImage: '',
  codeChanges: [{ beforeCode: '', afterCode: '' }],
  afterImage: '',
  reasonAndResult: '',
};

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
      beforeCode?: string;
      afterCode?: string;
    };
    const codeChanges =
      Array.isArray(parsed.codeChanges) && parsed.codeChanges.length > 0
        ? parsed.codeChanges.map((pair) => ({
            beforeCode: typeof pair?.beforeCode === 'string' ? pair.beforeCode : '',
            afterCode: typeof pair?.afterCode === 'string' ? pair.afterCode : '',
          }))
        : [
            {
              beforeCode: typeof parsed.beforeCode === 'string' ? parsed.beforeCode : '',
              afterCode: typeof parsed.afterCode === 'string' ? parsed.afterCode : '',
            },
          ];
    return {
      beforeImage: typeof parsed.beforeImage === 'string' ? parsed.beforeImage : '',
      codeChanges,
      afterImage: typeof parsed.afterImage === 'string' ? parsed.afterImage : '',
      reasonAndResult: typeof parsed.reasonAndResult === 'string' ? parsed.reasonAndResult : '',
    };
  } catch {
    return EMPTY_REVISION_DRAFT;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>('overview');
  const [backendMode, setBackendMode] = useState<BackendMode>('checking');
  const [teacherAuthenticated, setTeacherAuthenticated] = useState(false);
  const [plans, setPlans] = useState<AppPlanSubmission[]>([]);
  const [revisions, setRevisions] = useState<AppRevisionSubmission[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [lastSavedPlan, setLastSavedPlan] = useState<AppPlanSubmission | null>(null);
  const [lastSavedRevision, setLastSavedRevision] = useState<AppRevisionSubmission | null>(null);
  const [formInput, setFormInput] = useState<AppPlanInput>(loadSessionForm);
  const [revisionDraft, setRevisionDraft] = useState<RevisionDraftState>(loadSessionRevision);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);

  const loadTeacherData = useCallback(async () => {
    setLoadingPlans(true);
    setTeacherError(null);
    const [plansRes, revisionsRes, galleryRes] = await Promise.all([
      fetchTeacherPlans(),
      fetchTeacherRevisions(),
      fetchTeacherGallery(),
    ]);
    if (plansRes.unauthorized || revisionsRes.unauthorized || galleryRes.unauthorized) {
      setTeacherAuthenticated(false);
      setPlans([]);
      setRevisions([]);
      setGalleryItems([]);
      setTeacherError(
        plansRes.error || revisionsRes.error || galleryRes.error || '교사 로그인이 필요합니다.',
      );
    } else if (!plansRes.connected || !revisionsRes.connected || !galleryRes.connected) {
      setBackendMode('unavailable');
      setPlans([]);
      setRevisions([]);
      setGalleryItems([]);
      setTeacherError(
        plansRes.error || revisionsRes.error || galleryRes.error || '저장소와 연결되지 않았습니다.',
      );
    } else if (plansRes.error || revisionsRes.error || galleryRes.error) {
      setPlans(plansRes.plans);
      setRevisions(revisionsRes.revisions);
      setGalleryItems(galleryRes.items);
      setTeacherError(plansRes.error || revisionsRes.error || galleryRes.error || null);
    } else {
      setBackendMode('ready');
      setPlans(plansRes.plans);
      setRevisions(revisionsRes.revisions);
      setGalleryItems(galleryRes.items);
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

  function handlePlanSaved(plan: AppPlanSubmission) {
    setLastSavedPlan(plan);
    if (teacherAuthenticated) {
      setPlans((prev) => [plan, ...prev]);
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

  function navigateToPage(page: PageKey) {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#eef2f6] text-slate-950">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-700 bg-slate-900 text-white">
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
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigateToPage(item.key)}
                  className={`min-h-[44px] rounded-lg px-3.5 py-2 text-[15px] font-bold tracking-tight transition-colors whitespace-nowrap shrink-0 cursor-pointer lg:px-4 lg:text-base ${
                    active
                      ? 'bg-blue-500 text-white'
                      : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Non-sticky mobile navigation strip */}
      <nav aria-label="모바일 메뉴" className="border-b border-slate-700 bg-slate-800 px-4 py-2.5 md:hidden">
        <div className="flex items-center gap-2 overflow-x-auto">
          {MENU_ITEMS.map((item) => {
            const active = activePage === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigateToPage(item.key)}
                className={`min-h-[46px] rounded-lg px-4 py-2.5 text-sm font-bold tracking-tight transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-700 text-slate-100 hover:bg-slate-600 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main id="top" className="flex-1">
        {activePage === 'overview' && (
          <LessonOverview onStartDiscovery={() => navigateToPage('discovery')} />
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
            backendMode={backendMode}
            lastSavedPlan={lastSavedPlan}
            onPlanSaved={handlePlanSaved}
            onBackendModeChange={setBackendMode}
            onResetDraft={handleResetDraft}
          />
        )}

        {activePage === 'revision' && (
          <RevisionPage
            authorForm={{
              grade: formInput.grade,
              classRoom: formInput.classRoom,
              studentName: formInput.studentName,
              problemSummary: formInput.problemSummary,
            }}
            onGoToDiscovery={() => navigateToPage('discovery')}
            revisionDraft={revisionDraft}
            onUpdateRevisionField={handleUpdateRevisionField}
            onResetRevisionDraft={handleResetRevisionDraft}
            backendMode={backendMode}
            lastSavedRevision={lastSavedRevision}
            onRevisionSaved={handleRevisionSaved}
            onBackendModeChange={setBackendMode}
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
              setTeacherError(null);
            }}
            onRefresh={loadTeacherData}
            onUpdatePlan={handleUpdatePlan}
            onRemovePlan={handleRemovePlan}
            onUpdateRevision={handleUpdateRevision}
            onRemoveRevision={handleRemoveRevision}
            onUpdateGalleryItem={handleUpdateGalleryItem}
            onRemoveGalleryItem={handleRemoveGalleryItem}
          />
        )}
      </main>

      <footer className="border-t border-slate-300 bg-white">
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
    </div>
  );
}
