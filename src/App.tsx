import { useCallback, useEffect, useState } from 'react';
import LessonOverview from './components/LessonOverview';
import ProblemDiscovery from './components/ProblemDiscovery';
import AppPlanForm from './components/AppPlanForm';
import GalleryPage from './components/GalleryPage';
import TeacherReview from './components/TeacherReview';
import type { AppPlanInput, AppPlanSubmission } from './types/lesson';
import {
  checkBackendHealth,
  checkTeacherSession,
  fetchTeacherPlans,
  type BackendMode,
} from './services/planApi';

type PageKey = 'overview' | 'discovery' | 'plan' | 'gallery' | 'teacher';

const MENU_ITEMS: { key: PageKey; label: string }[] = [
  { key: 'overview', label: '수업안내' },
  { key: 'discovery', label: '문제탐색' },
  { key: 'plan', label: '앱 기획서' },
  { key: 'gallery', label: '갤러리' },
  { key: 'teacher', label: '교사확인' },
];

const SESSION_FORM_KEY = 'vibe_coding_p1_form_input';

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
  safetyChecked: false,
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

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>('overview');
  const [backendMode, setBackendMode] = useState<BackendMode>('checking');
  const [teacherAuthenticated, setTeacherAuthenticated] = useState(false);
  const [plans, setPlans] = useState<AppPlanSubmission[]>([]);
  const [lastSavedPlan, setLastSavedPlan] = useState<AppPlanSubmission | null>(null);
  const [formInput, setFormInput] = useState<AppPlanInput>(loadSessionForm);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);

  const loadTeacherData = useCallback(async () => {
    setLoadingPlans(true);
    setTeacherError(null);
    const res = await fetchTeacherPlans();
    if (res.unauthorized) {
      setTeacherAuthenticated(false);
      setPlans([]);
      setTeacherError(res.error || '교사 로그인이 필요합니다.');
    } else if (!res.connected) {
      setBackendMode('unavailable');
      setPlans([]);
      setTeacherError(res.error || '저장소와 연결되지 않았습니다.');
    } else if (res.error) {
      setTeacherError(res.error);
    } else {
      setBackendMode('ready');
      setPlans(res.plans);
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

  function handleResetDraft() {
    setLastSavedPlan(null);
    setFormInput(EMPTY_INPUT);
    try {
      window.sessionStorage.removeItem(SESSION_FORM_KEY);
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

  function handleUpdatePlan(updated: AppPlanSubmission) {
    setPlans((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }

  function handleRemovePlan(id: string) {
    setPlans((prev) => prev.filter((item) => item.id !== id));
  }

  function navigateToPage(page: PageKey) {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-2.5 sm:px-6 sm:py-3">
          {/* Zone 1: Single-element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              navigateToPage('overview');
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            바이브 코딩 프로젝트
          </a>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            {MENU_ITEMS.map((item) => {
              const active = activePage === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigateToPage(item.key)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                    active
                      ? 'border-sky-700 text-sky-700 font-semibold'
                      : 'border-transparent hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            {activePage === 'plan' ? (
              <button
                type="button"
                onClick={() => navigateToPage('teacher')}
                className="min-h-[40px] rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:px-4"
              >
                교사확인
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigateToPage('plan')}
                className="min-h-[40px] rounded-lg bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer sm:px-4"
              >
                앱 기획서 작성
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Non-sticky mobile 5-page navigation strip */}
      <nav aria-label="모바일 메뉴" className="border-b border-slate-200 bg-white px-4 py-2 md:hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {MENU_ITEMS.map((item) => {
            const active = activePage === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigateToPage(item.key)}
                className={`min-h-[44px] rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-sky-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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

        {activePage === 'gallery' && <GalleryPage />}

        {activePage === 'teacher' && (
          <TeacherReview
            backendMode={backendMode}
            authenticated={teacherAuthenticated}
            plans={plans}
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
              setTeacherError(null);
            }}
            onRefresh={loadTeacherData}
            onUpdatePlan={handleUpdatePlan}
            onRemovePlan={handleRemovePlan}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 text-xs text-slate-500 sm:px-6">
          <span>코드를 읽고 다시 쓰는 바이브 코딩 프로젝트 · 고등학교 1학년 정보 (1차시)</span>
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
