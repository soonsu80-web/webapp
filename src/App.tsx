import { useCallback, useEffect, useState } from 'react';
import LessonOverview from './components/LessonOverview';
import ProblemDiscovery from './components/ProblemDiscovery';
import AppPlanForm from './components/AppPlanForm';
import GalleryPage from './components/GalleryPage';
import TeacherReview from './components/TeacherReview';
import type { AppPlanInput, AppPlanSubmission, GalleryItem } from './types/lesson';
import {
  checkBackendHealth,
  checkTeacherSession,
  fetchTeacherGallery,
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
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [lastSavedPlan, setLastSavedPlan] = useState<AppPlanSubmission | null>(null);
  const [formInput, setFormInput] = useState<AppPlanInput>(loadSessionForm);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);

  const loadTeacherData = useCallback(async () => {
    setLoadingPlans(true);
    setTeacherError(null);
    const [plansRes, galleryRes] = await Promise.all([fetchTeacherPlans(), fetchTeacherGallery()]);
    if (plansRes.unauthorized || galleryRes.unauthorized) {
      setTeacherAuthenticated(false);
      setPlans([]);
      setGalleryItems([]);
      setTeacherError(plansRes.error || galleryRes.error || '교사 로그인이 필요합니다.');
    } else if (!plansRes.connected || !galleryRes.connected) {
      setBackendMode('unavailable');
      setPlans([]);
      setGalleryItems([]);
      setTeacherError(plansRes.error || galleryRes.error || '저장소와 연결되지 않았습니다.');
    } else if (plansRes.error || galleryRes.error) {
      setPlans(plansRes.plans);
      setGalleryItems(galleryRes.items);
      setTeacherError(plansRes.error || galleryRes.error || null);
    } else {
      setBackendMode('ready');
      setPlans(plansRes.plans);
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
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
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

          <nav aria-label="주요 메뉴" className="hidden md:flex items-center gap-2">
            {MENU_ITEMS.map((item) => {
              const active = activePage === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigateToPage(item.key)}
                  className={`min-h-[44px] rounded-lg px-4 py-2 text-base font-bold tracking-tight transition-colors whitespace-nowrap shrink-0 cursor-pointer lg:px-5 lg:text-[17px] ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Non-sticky mobile 5-page navigation strip */}
      <nav aria-label="모바일 메뉴" className="border-b border-slate-800 bg-slate-900 px-4 py-2.5 md:hidden">
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
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white'
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

        {activePage === 'gallery' && <GalleryPage backendMode={backendMode} />}

        {activePage === 'teacher' && (
          <TeacherReview
            backendMode={backendMode}
            authenticated={teacherAuthenticated}
            plans={plans}
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
              setGalleryItems([]);
              setTeacherError(null);
            }}
            onRefresh={loadTeacherData}
            onUpdatePlan={handleUpdatePlan}
            onRemovePlan={handleRemovePlan}
            onUpdateGalleryItem={handleUpdateGalleryItem}
            onRemoveGalleryItem={handleRemoveGalleryItem}
          />
        )}
      </main>

      <footer className="border-t border-slate-300 bg-white">
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
